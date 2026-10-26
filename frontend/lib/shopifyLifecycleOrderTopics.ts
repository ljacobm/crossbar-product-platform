// Pure logic, deliberately without the `server-only` guard (unlike
// app/api/webhooks/shopify/ingestLifecycle.ts, which imports
// lib/supabase-admin.ts and therefore throws if imported outside
// Next's own bundler) -- so
// scripts/verifyShopifyLifecycleIngestion.ts can exercise this one
// decision directly, with no database import in the chain at all.
//
// orders/edited's real REST payload shape has not been captured and
// confirmed yet (see the Phase 1 plan) -- the strongest available
// signal (unofficial) suggests it may carry a diff/delta structure
// rather than a full current order snapshot. Rather than guess, this is
// a hard-coded decision keyed on the topic name alone, deliberately NOT
// derived from what any given delivery's payload happens to contain:
// orders/edited is never treated as a complete line-item snapshot, full
// stop, even if a specific payload happens to look like a complete
// order. orders/create/updated/cancelled all share REST's long-stable,
// well-understood full-order shape and are always treated as complete.
export function isCompleteSnapshotForLifecycleOrderTopic(
  topic: "orders/updated" | "orders/cancelled" | "orders/edited"
): boolean {
  return topic !== "orders/edited";
}
