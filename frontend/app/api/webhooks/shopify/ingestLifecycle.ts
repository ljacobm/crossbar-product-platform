import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeRestOrder,
  normalizeRestFulfillment,
  normalizeRestRefund,
  type ShopifyOrderPayload,
  type ShopifyFulfillmentPayload,
  type ShopifyRefundPayload,
} from "@/lib/shopifyRestAdapter";
import {
  syncShopifyOrderViaRpc,
  syncShopifyFulfillmentViaRpc,
  syncShopifyRefundViaRpc,
} from "@/lib/shopifyNormalized";
import { isShopifyDiscountCaptureEnabled } from "@/lib/shopifyLifecycleFlags";
import { isCompleteSnapshotForLifecycleOrderTopic } from "@/lib/shopifyLifecycleOrderTopics";

export type { ShopifyFulfillmentPayload, ShopifyRefundPayload };
export { isCompleteSnapshotForLifecycleOrderTopic };

// Phase 1, Milestone 2: ingest handlers for the NEW lifecycle webhook
// topics only -- orders/create continues to go through ingest.ts's
// processShopifyOrder() (the old, unchanged upsertNormalizedOrder()
// path) exclusively; nothing here is on that path, and nothing here is
// reachable at all unless route.ts's SHOPIFY_LIFECYCLE_TOPICS_ENABLED
// gate has already let the specific topic through.
//
// isCompleteSnapshotForLifecycleOrderTopic() itself lives in
// lib/shopifyLifecycleOrderTopics.ts, a plain module without this
// file's transitive server-only guard (via lib/supabase-admin.ts), so
// scripts/verifyShopifyLifecycleIngestion.ts can import and exercise
// that one decision directly.

export async function processShopifyOrderLifecycleUpdate(
  topic: "orders/updated" | "orders/cancelled" | "orders/edited",
  payload: ShopifyOrderPayload
): Promise<{ orderId: number }> {
  const normalized = normalizeRestOrder(payload);

  // SHOPIFY_CAPTURE_DISCOUNTS gates discount data specifically, even
  // though this order-lifecycle topic itself may already be enabled.
  // Disabled means "no opinion" (SQL NULL) -- existing discount rows,
  // if any, are left untouched -- never "confirmed empty," which would
  // incorrectly clear them.
  if (!isShopifyDiscountCaptureEnabled()) {
    normalized.discounts = undefined;
  }

  const result = await syncShopifyOrderViaRpc(supabaseAdmin, normalized, {
    source: "webhook",
    isCompleteLineItemSnapshot: isCompleteSnapshotForLifecycleOrderTopic(topic),
    isEditEvent: topic === "orders/edited",
  });

  return { orderId: result.orderId };
}

export async function processShopifyFulfillment(
  payload: ShopifyFulfillmentPayload
): Promise<{ orderId: number }> {
  const normalized = normalizeRestFulfillment(payload);
  const result = await syncShopifyFulfillmentViaRpc(supabaseAdmin, payload.order_id, normalized);
  return { orderId: result.orderId };
}

export async function processShopifyRefund(
  payload: ShopifyRefundPayload
): Promise<{ orderId: number }> {
  const normalized = normalizeRestRefund(payload);
  const result = await syncShopifyRefundViaRpc(supabaseAdmin, payload.order_id, normalized);
  return { orderId: result.orderId };
}
