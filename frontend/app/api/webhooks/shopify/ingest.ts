import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeRestOrder, type ShopifyOrderPayload } from "@/lib/shopifyRestAdapter";
import { upsertNormalizedOrder, syncShopifyOrderDiscountsViaRpc } from "@/lib/shopifyNormalized";
import { isShopifyDiscountCaptureEnabled } from "@/lib/shopifyLifecycleFlags";

export type { ShopifyOrderPayload };

// Thin wrapper: the webhook route only ever needs to normalize+upsert one
// REST-shaped order payload using the admin client. All the actual
// normalization (shopifyRestAdapter.ts) and upsert/business-rule logic
// (shopifyNormalized.ts) is shared with the historical importer -- see
// frontend/scripts/backfillShopifyOrders.ts.
//
// Phase 1, Milestone 3: the discount call below is purely additive --
// upsertNormalizedOrder() above is completely unchanged from before this
// milestone, so orders/create's existing order/line-item write behavior
// is identical regardless of SHOPIFY_CAPTURE_DISCOUNTS. When disabled,
// the discount call is skipped entirely (not even attempted with a null
// payload) -- cheaper and simpler than calling the RPC with "no
// opinion" for the highest-volume webhook. normalized.discounts is
// already computed by normalizeRestOrder() for every call regardless of
// this flag (see shopifyRestAdapter.ts's buildDiscountsFromRest) --
// this call is the only place that decides whether to act on it.
//
// FAILURE BEHAVIOR: if syncShopifyOrderDiscountsViaRpc throws, this
// function throws too, AFTER upsertNormalizedOrder() has already
// committed the order/line items. That exception propagates unchanged
// to route.ts's existing catch block, which marks this delivery's
// shopify_webhook_events row 'failed' with the discount error message
// and returns HTTP 500 -- Shopify retries the whole delivery. Both
// upsertNormalizedOrder() (natural-key upsert) and
// sync_shopify_order_discounts() (delete-then-reinsert-in-one-
// transaction) are independently idempotent, so a retry safely
// re-applies the order and re-replaces the discount set -- never
// duplicates or partially-corrupts either. No separate error handling
// is introduced here deliberately: this is the exact same observable-
// and-retryable mechanism every other ingestion failure already uses.
export async function processShopifyOrder(payload: ShopifyOrderPayload): Promise<{ orderId: number }> {
  const normalized = normalizeRestOrder(payload);
  const result = await upsertNormalizedOrder(supabaseAdmin, normalized, { source: "webhook" });

  if (isShopifyDiscountCaptureEnabled()) {
    await syncShopifyOrderDiscountsViaRpc(supabaseAdmin, normalized.shopifyOrderId, normalized.discounts);
  }

  return { orderId: result.orderId };
}
