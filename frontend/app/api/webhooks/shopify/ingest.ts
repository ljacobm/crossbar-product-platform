import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeRestOrder, type ShopifyOrderPayload } from "@/lib/shopifyRestAdapter";
import { upsertNormalizedOrder } from "@/lib/shopifyNormalized";

export type { ShopifyOrderPayload };

// Thin wrapper: the webhook route only ever needs to normalize+upsert one
// REST-shaped order payload using the admin client. All the actual
// normalization (shopifyRestAdapter.ts) and upsert/business-rule logic
// (shopifyNormalized.ts) is shared with the historical importer -- see
// frontend/scripts/backfillShopifyOrders.ts.
export async function processShopifyOrder(payload: ShopifyOrderPayload): Promise<{ orderId: number }> {
  const normalized = normalizeRestOrder(payload);
  const result = await upsertNormalizedOrder(supabaseAdmin, normalized, { source: "webhook" });
  return { orderId: result.orderId };
}
