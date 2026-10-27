import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCompleteSnapshotForLifecycleOrderTopic } from "@/lib/shopifyLifecycleOrderTopics";
import { normalizeRestOrder, type ShopifyOrderPayload } from "@/lib/shopifyRestAdapter";
import { buildDiscountsJson } from "@/lib/shopifyNormalized";

// Phase 1, Milestone 2: tests for the ingest-orchestration layer --
// isCompleteSnapshotForLifecycleOrderTopic() is a pure function and is
// exercised directly with real assertions. Everything else that
// matters here (webhook routing dispatch, HMAC/dedup preservation,
// and confirming the TypeScript layer does not duplicate or conflict
// with the SQL-level staleness guard) requires either a live HTTP
// request/response cycle or a live Supabase connection to exercise for
// real -- neither is available in this environment (no DB connection
// is made anywhere in this file) -- so those are covered by source-text
// structural checks instead, the same deliberate, disclosed substitute
// for behavioral testing already used throughout this project's portal
// work (see scripts/verifyPortalPrivacy.ts's own header comment for the
// same rationale) and the Shopify SQL-function migration's own test
// suite (database/tests/shopify_order_lifecycle_sync_test.sql) for the
// genuinely database-level behavior (out-of-order rejection, staleness,
// atomic discount replacement) these structural checks deliberately do
// NOT re-test -- that would just be re-asserting the SQL tests already
// cover, not testing anything new at this layer.
//
// Run via `npx tsx scripts/verifyShopifyLifecycleIngestion.ts`.

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "..", relativePath), "utf8");
}

function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// --- isCompleteSnapshotForLifecycleOrderTopic: real, executable -------

run("orders/edited is never treated as a complete line-item snapshot, regardless of payload shape", () => {
  assert.equal(isCompleteSnapshotForLifecycleOrderTopic("orders/edited"), false);
});

run("orders/updated and orders/cancelled ARE treated as complete snapshots", () => {
  assert.equal(isCompleteSnapshotForLifecycleOrderTopic("orders/updated"), true);
  assert.equal(isCompleteSnapshotForLifecycleOrderTopic("orders/cancelled"), true);
});

run("the complete-snapshot decision is keyed purely on topic name -- it takes no payload argument at all", () => {
  // Type-level guarantee as much as a runtime one: the function's only
  // parameter is the topic string. Asserting arity here keeps that an
  // executable, regression-proof check rather than just a comment --
  // if a future edit ever threads a payload into this function to
  // "smart-detect" completeness, this test breaks immediately.
  assert.equal(isCompleteSnapshotForLifecycleOrderTopic.length, 1);
});

// --- Ingest layer: discount-capture gating happens before the RPC call -

run("processShopifyOrderLifecycleUpdate clears discounts (sets undefined, not null/[]) when discount capture is disabled", () => {
  const source = stripLineComments(readSource("app/api/webhooks/shopify/ingestLifecycle.ts"));
  const fnMatch = source.match(
    /export async function processShopifyOrderLifecycleUpdate\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "expected to find processShopifyOrderLifecycleUpdate's full body");
  const body = fnMatch![0];

  const flagCheckIndex = body.indexOf("isShopifyDiscountCaptureEnabled()");
  const clearIndex = body.indexOf("normalized.discounts = undefined");
  const rpcCallIndex = body.indexOf("syncShopifyOrderViaRpc(");
  assert.ok(flagCheckIndex !== -1 && clearIndex !== -1 && rpcCallIndex !== -1);
  assert.ok(flagCheckIndex < clearIndex, "the flag check must gate the clearing of discounts");
  assert.ok(clearIndex < rpcCallIndex, "discounts must be cleared before the RPC call, not after");
});

run("processShopifyFulfillment and processShopifyRefund never reference the discount-capture flag at all", () => {
  const source = stripLineComments(readSource("app/api/webhooks/shopify/ingestLifecycle.ts"));
  const fulfillmentMatch = source.match(
    /export async function processShopifyFulfillment\([\s\S]*?\n\}/
  );
  const refundMatch = source.match(/export async function processShopifyRefund\([\s\S]*?\n\}/);
  assert.ok(fulfillmentMatch && refundMatch);
  assert.equal(fulfillmentMatch![0].includes("DiscountCapture"), false);
  assert.equal(refundMatch![0].includes("DiscountCapture"), false);
});

// --- Webhook route dispatch: structural (no live request available) --

run("orders/create routes unconditionally to the OLD processShopifyOrder() -- never gated by the lifecycle flag", () => {
  const source = stripLineComments(readSource("app/api/webhooks/shopify/route.ts"));
  assert.ok(
    source.includes('topic === "orders/create" || (isLifecycleTopic && isShopifyLifecycleTopicEnabled(topic))'),
    "expected orders/create to be unconditionally true in the shouldProcess decision, independent of the lifecycle flag"
  );
  const branchStart = source.indexOf('if (topic === "orders/create") {');
  const branchEnd = source.indexOf("} else if (LIFECYCLE_ORDER_TOPICS.has(topic))");
  assert.ok(branchStart !== -1, "expected to find the orders/create dispatch branch");
  assert.ok(branchEnd !== -1 && branchEnd > branchStart, "expected the next branch to follow it");
  const branch = source.slice(branchStart, branchEnd);
  assert.ok(branch.includes("processShopifyOrder("));
  assert.equal(branch.includes("processShopifyOrderLifecycleUpdate"), false);
});

run("every new lifecycle topic is gated by isShopifyLifecycleTopicEnabled before its handler can run", () => {
  const source = stripLineComments(readSource("app/api/webhooks/shopify/route.ts"));
  const flagCheckIndex = source.indexOf("isShopifyLifecycleTopicEnabled(topic)");
  const dispatchIndex = source.indexOf("processShopifyOrderLifecycleUpdate(");
  assert.ok(flagCheckIndex !== -1 && dispatchIndex !== -1);
  assert.ok(flagCheckIndex < dispatchIndex, "the flag check must run before any lifecycle handler is dispatched");

  // A disabled-but-recognized lifecycle topic must be treated
  // identically to an unrecognized topic (recorded, marked processed,
  // no business-table write) -- never partially applied.
  assert.ok(source.includes('status: isLifecycleTopic ? "disabled" : "ignored"'));
});

run("HMAC verification and delivery-level dedup are unchanged -- byte-for-byte present, not refactored away", () => {
  const source = readSource("app/api/webhooks/shopify/route.ts");
  assert.ok(source.includes("verifyShopifyHmac(rawBody, hmacHeader, secret)"));
  assert.ok(source.includes('request.headers.get("X-Shopify-Hmac-Sha256")'));
  assert.ok(source.includes('request.headers.get("X-Shopify-Webhook-Id")'));
  assert.ok(source.includes(".eq(\"shopify_webhook_id\", webhookId)"));
  assert.ok(source.includes("RECEIVED_STALE_MS"));
  assert.ok(source.includes("UNIQUE_VIOLATION"));
  // Unverified requests must still write nothing, not even the audit
  // log -- confirmed by the HMAC check running before any
  // shopify_webhook_events query/write.
  const hmacCheckIndex = source.indexOf("verifyShopifyHmac(rawBody, hmacHeader, secret)");
  const firstAuditWriteIndex = source.indexOf('.from("shopify_webhook_events")');
  assert.ok(hmacCheckIndex !== -1 && firstAuditWriteIndex !== -1);
  assert.ok(hmacCheckIndex < firstAuditWriteIndex);
});

run("the dedup/idempotency logic runs identically regardless of which topic eventually gets dispatched", () => {
  // The dispatch decision (shouldProcess / isLifecycleTopic) must be
  // computed AFTER the existing-event lookup/insert logic, never
  // before -- otherwise a disabled or unknown topic could skip
  // recording the delivery at all, which would break Shopify's retry
  // semantics (a webhook that was silently dropped looks identical, to
  // Shopify, to one that failed and should be retried less urgently).
  const source = stripLineComments(readSource("app/api/webhooks/shopify/route.ts"));
  const eventRowIdAssignedIndex = source.indexOf("eventRowId = inserted.id;");
  const dispatchDecisionIndex = source.indexOf("const shouldProcess =");
  assert.ok(eventRowIdAssignedIndex !== -1 && dispatchDecisionIndex !== -1);
  assert.ok(eventRowIdAssignedIndex < dispatchDecisionIndex);
});

run("the TypeScript layer performs no date/timestamp comparison of its own -- out-of-order rejection is entirely the SQL layer's responsibility", () => {
  // Guards against the ingest/RPC-calling layer ever re-implementing
  // (and potentially drifting from, or double-guarding against) the
  // staleness logic that already lives in sync_shopify_order()/
  // sync_shopify_fulfillment() (see database/migrations/
  // 20261026_add_shopify_order_lifecycle_sync.sql and its own test
  // suite). ingestLifecycle.ts and shopifyNormalized.ts's RPC-calling
  // functions should only ever pass timestamps through, never compare
  // two of them against each other.
  for (const file of ["app/api/webhooks/shopify/ingestLifecycle.ts", "lib/shopifyNormalized.ts"]) {
    const source = stripLineComments(readSource(file));
    assert.equal(/updatedAt\s*[<>]/.test(source), false, `${file} must not compare updatedAt itself`);
    assert.equal(/new Date\([^)]*\)\s*[<>]/.test(source), false, `${file} must not compare two Date objects`);
  }
});

run("syncShopifyOrderViaRpc passes p_is_complete_line_item_snapshot straight from the caller, never deriving it from the payload", () => {
  const source = stripLineComments(readSource("lib/shopifyNormalized.ts"));
  const fnMatch = source.match(/export async function syncShopifyOrderViaRpc\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected to find syncShopifyOrderViaRpc's full body");
  assert.ok(fnMatch![0].includes("p_is_complete_line_item_snapshot: options.isCompleteLineItemSnapshot"));
});

// =============================================================================
// Phase 1, Milestone 3: discount capture for orders/create.
// =============================================================================

// buildDiscountsJson's own missing-vs-empty-vs-populated behavior was
// previously exported "specifically so it's unit-testable" (see its own
// comment in lib/shopifyNormalized.ts) but had no direct test -- this
// closes that gap.
run("buildDiscountsJson: undefined and null both become SQL-null ('no opinion'); an array (even empty) passes through", () => {
  assert.equal(buildDiscountsJson(undefined), null);
  assert.equal(buildDiscountsJson(null), null);
  assert.deepEqual(buildDiscountsJson([]), []);
});

// Real production order #15065: a $60.00 fixed-amount discount code,
// capped by Shopify to $54.72 actually allocated against this specific
// order (confirmed: shopify_orders.total_discounts for that order is
// also 54.72). application.value/valueAmount is the discount's OWN
// configured rule value; discount_allocations[].amount is what was
// actually taken off THIS order -- these must never be conflated. This
// test exercises the real adapter (normalizeRestOrder, not a
// hand-simplified stand-in) end to end.
run("real #15065 shape: the $60 configured value and the $54.72 actually-allocated amount are captured in separate fields, never confused", () => {
  const payload: ShopifyOrderPayload = {
    id: 15065,
    discount_applications: [
      {
        type: "discount_code",
        code: "8PW77TL",
        value_type: "fixed_amount",
        value: "60.0",
        target_type: "line_item",
        target_selection: "explicit",
        allocation_method: "across",
      },
    ],
    line_items: [
      {
        id: 1,
        quantity: 1,
        price: "54.72",
        discount_allocations: [{ amount: "54.72", discount_application_index: 0 }],
      },
    ],
  };

  const normalized = normalizeRestOrder(payload);
  const discounts = buildDiscountsJson(normalized.discounts);
  assert.ok(discounts, "expected a populated discounts array");
  assert.equal(discounts!.length, 1);

  const [discount] = discounts!;
  assert.equal(discount.applicationType, "discount_code");
  assert.equal(discount.code, "8PW77TL");
  assert.equal(discount.valueType, "fixed_amount");
  // The discount's OWN configured value -- $60, not the actually-applied amount.
  assert.equal(discount.valueAmount, 60);

  const allocations = discount.allocations as { allocatedAmount: number | null }[];
  const totalAllocated = allocations.reduce((sum, a) => sum + (a.allocatedAmount ?? 0), 0);
  // What was ACTUALLY taken off this specific order -- $54.72, never $60.
  assert.equal(totalAllocated, 54.72);
  assert.notEqual(totalAllocated, discount.valueAmount);
});

// An order with no discount at all, then a later update that adds one,
// then a further update that removes it again -- all three states must
// be distinguishable via the same null/empty/populated JSON CONTRACT
// already proven at the SQL level (tests 5/6 in
// database/tests/shopify_order_lifecycle_sync_test.sql).
run("no-discount order, then an update that adds a discount, then an update that removes it -- all three states distinguishable", () => {
  const noDiscountPayload: ShopifyOrderPayload = { id: 1, discount_applications: [], line_items: [] };
  const noDiscount = normalizeRestOrder(noDiscountPayload);
  // Confirmed empty -- Shopify explicitly reported zero discounts.
  assert.deepEqual(buildDiscountsJson(noDiscount.discounts), []);

  const withDiscountPayload: ShopifyOrderPayload = {
    id: 1,
    discount_applications: [{ type: "manual", value_type: "percentage", value: "10.0" }],
    line_items: [],
  };
  const withDiscount = normalizeRestOrder(withDiscountPayload);
  const withDiscountJson = buildDiscountsJson(withDiscount.discounts);
  assert.equal(withDiscountJson!.length, 1);
  assert.equal(withDiscountJson![0].valuePercentage, 10);

  const removedAgainPayload: ShopifyOrderPayload = { id: 1, discount_applications: [], line_items: [] };
  const removedAgain = normalizeRestOrder(removedAgainPayload);
  // Explicitly cleared -- distinct from "never looked" (undefined/null).
  assert.deepEqual(buildDiscountsJson(removedAgain.discounts), []);

  // A payload that omits discount_applications entirely (vs. reporting
  // it as []) is "no opinion" -- must never be confused with "confirmed
  // empty."
  const neverLookedPayload = { id: 1, line_items: [] } as ShopifyOrderPayload;
  const neverLooked = normalizeRestOrder(neverLookedPayload);
  assert.equal(buildDiscountsJson(neverLooked.discounts), null);
});

run("processShopifyOrder (orders/create): discount sync is additive, flag-gated, and runs AFTER upsertNormalizedOrder, never before", () => {
  const source = stripLineComments(readSource("app/api/webhooks/shopify/ingest.ts"));
  const fnMatch = source.match(/export async function processShopifyOrder\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected to find processShopifyOrder's full body");
  const body = fnMatch![0];

  const upsertIndex = body.indexOf("upsertNormalizedOrder(");
  const flagCheckIndex = body.indexOf("isShopifyDiscountCaptureEnabled()");
  const discountCallIndex = body.indexOf("syncShopifyOrderDiscountsViaRpc(");
  assert.ok(upsertIndex !== -1 && flagCheckIndex !== -1 && discountCallIndex !== -1);
  assert.ok(upsertIndex < flagCheckIndex, "the existing order/line-item upsert must run before the new discount gate");
  assert.ok(flagCheckIndex < discountCallIndex, "the flag check must gate the discount RPC call");
});

// Updated for the staff-facing discount display feature: salesCalculations.ts
// now legitimately reads shopify_orders.total_discounts/shopify_order_discounts
// (for display-only fields attached to each SalesLineItemRow), so the blanket
// "never reads any discount table or column" check from before that feature
// no longer applies. What must still hold -- and is checked precisely here --
// is that the TOTALS/BEST-SELLERS computation itself (totalSales, totalItems,
// bestSellerMap, both scoped to `let totalSales = 0;` through the loop that
// populates bestSellerMap, before any lineItems/discount display code begins)
// never references a discount table or column. This is the actual guarantee
// the sales dashboard's existing numbers depend on, not merely "the word
// doesn't appear in the file."
run("the sales totals/best-sellers computation itself never reads any discount table or column -- enabling capture cannot change existing totals", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  const totalsStart = source.indexOf("let totalSales = 0;");
  // Boundary is the discount-fetch block's own start, NOT the lineItems
  // mapping below it -- the discount fetch (scopedOrderIds/
  // discountsByOrderId) legitimately sits textually between the totals
  // loop and the lineItems mapping, so ending the slice at "const
  // lineItems:" would wrongly include it.
  const totalsEnd = source.indexOf("const scopedOrderIds =");
  assert.ok(totalsStart !== -1, "expected to find the start of the totals computation");
  assert.ok(totalsEnd !== -1, "expected to find the start of the discount-fetch block");
  assert.ok(totalsStart < totalsEnd, "totals computation must precede the discount-fetch block");

  const totalsBlock = source.slice(totalsStart, totalsEnd);
  assert.equal(totalsBlock.toLowerCase().includes("discount"), false);
});

// The new discount display fields must be attached to SalesLineItemRow (for
// the staff page to render), sourced from shopify_orders.total_discounts and
// shopify_order_discounts, and never summed per line item -- confirmed here
// by checking the discount lookup is keyed by distinct order id (a Map), not
// accumulated inside the per-line-item totals loop checked above.
run("discount display data is attached per order (via a Map keyed by order id), not accumulated per line item", () => {
  const source = readSource("lib/salesCalculations.ts");
  assert.ok(source.includes("shopify_order_discounts"));
  assert.ok(source.includes("total_discounts"));
  assert.ok(source.includes("discountsByOrderId"));
  assert.ok(/new Map<number, SalesLineItemDiscount\[\]>/.test(source));
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Shopify lifecycle ingestion/routing checks passed.");
}
