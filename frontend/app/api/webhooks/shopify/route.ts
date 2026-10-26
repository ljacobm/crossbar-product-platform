import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyShopifyHmac } from "@/lib/shopifyHmac";
import { processShopifyOrder, type ShopifyOrderPayload } from "./ingest";
import {
  processShopifyOrderLifecycleUpdate,
  processShopifyFulfillment,
  processShopifyRefund,
  type ShopifyFulfillmentPayload,
  type ShopifyRefundPayload,
} from "./ingestLifecycle";
import { isShopifyLifecycleTopicEnabled } from "@/lib/shopifyLifecycleFlags";

// Phase 1, Milestone 2: the new lifecycle topics, grouped by which
// ingest handler/payload shape they share. orders/create is
// deliberately NOT in any of these sets -- it is the existing,
// always-on path (never gated by SHOPIFY_LIFECYCLE_TOPICS_ENABLED), so
// the live production webhook keeps working unchanged regardless of
// this flag's state.
const LIFECYCLE_ORDER_TOPICS = new Set(["orders/updated", "orders/cancelled", "orders/edited"]);
const LIFECYCLE_FULFILLMENT_TOPICS = new Set(["fulfillments/create", "fulfillments/update"]);
const LIFECYCLE_REFUND_TOPICS = new Set(["refunds/create"]);

// Postgres unique_violation error code, returned by PostgREST when the
// shopify_webhook_id unique constraint is hit.
const UNIQUE_VIOLATION = "23505";

// How long a 'received' event is treated as an in-flight duplicate before
// it's considered stale (crashed/died mid-processing) and eligible for a
// retry. See the 'received' branch below.
const RECEIVED_STALE_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  // Raw body must be read before any JSON parsing -- HMAC is computed over
  // the exact bytes Shopify sent.
  const rawBody = await request.text();

  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const topic = request.headers.get("X-Shopify-Topic");
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");

  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error("Shopify webhook received but SHOPIFY_CLIENT_SECRET is not configured.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  if (!verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    // Unverified request -- write nothing to any table, not even the audit
    // log. The audit trail is only for confirmed-genuine deliveries.
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const expectedShopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (expectedShopDomain && shopDomain !== expectedShopDomain) {
    return NextResponse.json({ error: "Unexpected shop domain." }, { status: 401 });
  }

  // shopify_webhook_events.shopify_webhook_id and .topic are both `not
  // null`, and shopify_webhook_id is the delivery-level idempotency key --
  // a verified request missing either is malformed and is never normalized.
  if (!webhookId || !topic) {
    return NextResponse.json({ error: "Missing required webhook metadata." }, { status: 400 });
  }

  // The exact shape depends on `topic`, which TypeScript can't narrow
  // from a runtime header value -- each dispatch branch below casts to
  // the specific payload type its handler expects.
  let payload: ShopifyOrderPayload | ShopifyFulfillmentPayload | ShopifyRefundPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Layer 1 idempotency: query first, never blindly upsert or reset a
  // stored event. See plan §3 for the full reasoning.
  const { data: existingEvent, error: lookupError } = await supabaseAdmin
    .from("shopify_webhook_events")
    .select("id, status, received_at")
    .eq("shopify_webhook_id", webhookId)
    .maybeSingle();

  if (lookupError) {
    console.error(`Webhook event lookup failed for delivery ${webhookId}:`, lookupError.message);
    return NextResponse.json({ error: "Webhook event lookup failed." }, { status: 500 });
  }

  let eventRowId: number;

  if (existingEvent) {
    if (existingEvent.status === "processed") {
      // Already fully handled -- do not re-normalize, do not touch the row.
      return NextResponse.json({ status: "duplicate" }, { status: 200 });
    }

    if (existingEvent.status === "received") {
      const receivedAtMs = existingEvent.received_at ? new Date(existingEvent.received_at).getTime() : NaN;
      const ageMs = Number.isFinite(receivedAtMs) ? Date.now() - receivedAtMs : Infinity;

      if (ageMs < RECEIVED_STALE_MS) {
        // Still within the in-flight window -- a normalization attempt for
        // this exact delivery is presumed to be actively running elsewhere.
        // Don't start a second, concurrent one.
        return NextResponse.json({ status: "duplicate" }, { status: 200 });
      }
      // Stale 'received': the prior attempt likely crashed or died without
      // ever reaching a terminal status. Fall through and retry, same as a
      // 'failed' event -- lets a stuck request self-heal.
    }

    // status is 'failed', or a stale 'received': retry normalization
    // without overwriting the stored payload/received_at.
    eventRowId = existingEvent.id;
  } else {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("shopify_webhook_events")
      .insert({
        shopify_webhook_id: webhookId,
        topic,
        shop_domain: shopDomain,
        payload,
        status: "received",
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        // A near-simultaneous duplicate delivery raced us to the insert --
        // the other request owns this delivery id and is handling it.
        return NextResponse.json({ status: "duplicate" }, { status: 200 });
      }
      console.error(`Webhook event insert failed for delivery ${webhookId}:`, insertError.message);
      return NextResponse.json({ error: "Failed to record webhook event." }, { status: 500 });
    }
    eventRowId = inserted.id;
  }

  // Dispatch. orders/create is always processed (the existing,
  // unconditional path -- see ingest.ts). The new lifecycle topics
  // (orders/updated|cancelled|edited, fulfillments/create|update,
  // refunds/create) are processed only when explicitly enabled via
  // SHOPIFY_LIFECYCLE_TOPICS_ENABLED; everything else, including a
  // recognized-but-not-yet-enabled lifecycle topic, is recorded above
  // but otherwise a no-op -- identical treatment to an unrecognized
  // topic, so enabling a new topic can never partially apply anything.
  const isLifecycleTopic =
    LIFECYCLE_ORDER_TOPICS.has(topic) ||
    LIFECYCLE_FULFILLMENT_TOPICS.has(topic) ||
    LIFECYCLE_REFUND_TOPICS.has(topic);
  const shouldProcess =
    topic === "orders/create" || (isLifecycleTopic && isShopifyLifecycleTopicEnabled(topic));

  if (!shouldProcess) {
    const { error: ignoredUpdateError } = await supabaseAdmin
      .from("shopify_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
      .eq("id", eventRowId);

    if (ignoredUpdateError) {
      console.error(
        `Failed to mark ignored-topic webhook event ${webhookId} as processed:`,
        ignoredUpdateError.message
      );
      return NextResponse.json({ error: "Failed to update webhook event." }, { status: 500 });
    }

    return NextResponse.json(
      { status: isLifecycleTopic ? "disabled" : "ignored", topic },
      { status: 200 }
    );
  }

  try {
    let orderId: number;
    if (topic === "orders/create") {
      ({ orderId } = await processShopifyOrder(payload as ShopifyOrderPayload));
    } else if (LIFECYCLE_ORDER_TOPICS.has(topic)) {
      ({ orderId } = await processShopifyOrderLifecycleUpdate(
        topic as "orders/updated" | "orders/cancelled" | "orders/edited",
        payload as ShopifyOrderPayload
      ));
    } else if (LIFECYCLE_FULFILLMENT_TOPICS.has(topic)) {
      ({ orderId } = await processShopifyFulfillment(payload as ShopifyFulfillmentPayload));
    } else {
      ({ orderId } = await processShopifyRefund(payload as ShopifyRefundPayload));
    }

    const { error: processedUpdateError } = await supabaseAdmin
      .from("shopify_webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error_message: null,
        order_id: orderId,
      })
      .eq("id", eventRowId);

    if (processedUpdateError) {
      // Business data is already written and safe to reprocess (natural-key
      // upserts) -- return 500 so Shopify retries rather than silently
      // reporting success while the audit row is left stuck at 'received'.
      console.error(
        `Order ${orderId} normalized but failed to mark webhook event ${webhookId} as processed:`,
        processedUpdateError.message
      );
      return NextResponse.json({ error: "Failed to update webhook event." }, { status: 500 });
    }

    return NextResponse.json({ status: "processed" }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown normalization error.";
    console.error(`Shopify webhook normalization failed for delivery ${webhookId}:`, message);

    const { error: failedUpdateError } = await supabaseAdmin
      .from("shopify_webhook_events")
      .update({ status: "failed", error_message: message })
      .eq("id", eventRowId);

    if (failedUpdateError) {
      console.error(
        `Additionally failed to mark webhook event ${webhookId} as failed:`,
        failedUpdateError.message
      );
    }

    // Non-2xx so Shopify's automatic retry re-attempts later. The original
    // normalization error is the primary failure regardless of whether the
    // status update above also failed.
    return NextResponse.json({ error: "Normalization failed." }, { status: 500 });
  }
}
