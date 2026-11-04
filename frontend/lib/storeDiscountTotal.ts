// Pure aggregation logic for the Sales Data "Total Discounts" summary
// card -- split out of lib/salesCalculations.ts for the same reason as
// lib/discountDisplayState.ts/lib/orderLastName.ts: directly testable
// without a live Supabase connection.
//
// MULTI-STORE AMBIGUITY (investigated before implementing, per the
// approved spec): online_store_id lives on the LINE ITEM, not the
// order (see lib/salesCalculations.ts's own longstanding comment and
// scripts/verifyPortalPrivacy.ts's "financial queries are scoped at the
// line-item level" test) -- a single Shopify order can genuinely contain
// line items belonging to DIFFERENT online stores (e.g. one checkout
// covering two different teams' products). shopify_orders.total_discounts
// is a single, order-wide dollar amount with NO per-store breakdown
// anywhere in the schema. There is therefore no way to safely split a
// multi-store order's discount across the stores it touches using that
// column -- attributing the full amount to every touched store would
// double-count it; attributing it to just one would be an arbitrary,
// unjustified choice. RESOLUTION: an order's total_discounts is counted
// toward a store's Total Discounts figure ONLY when every one of that
// order's (non-addon-irrelevant) line items resolves to that exact same
// single store -- i.e. storeIds.length === 1. A multi-store order is
// excluded from EVERY store's total, never attributed to any one of
// them. This is a deliberate, reported design decision, not an
// oversight -- see the implementation report for this feature.
export interface OrderDiscountInput {
  orderId: number;
  // shopify_orders.total_discounts for this order -- null means the
  // column itself is null (genuinely unknown), never treated as 0.
  totalDiscounts: number | null;
  // The distinct, non-null online_store_id values found across ALL of
  // this order's line items (not just the current store's own subset) --
  // length 1 means every item belongs to the same single store; length
  // > 1 means the order spans multiple stores.
  storeIds: number[];
}

// Sums total_discounts across distinct orders, counted exactly once per
// order regardless of how many line items it has, and ONLY for orders
// that resolve to exactly one store. Always returns a definite number
// for a given (possibly empty) input array -- the caller is responsible
// for representing "the underlying lookup itself failed" as a separate,
// null summary value, not by passing something here.
export function computeTotalDiscounts(orders: OrderDiscountInput[]): number {
  let sum = 0;
  for (const order of orders) {
    if (order.storeIds.length !== 1) continue;
    if (order.totalDiscounts != null) sum += order.totalDiscounts;
  }
  return sum;
}
