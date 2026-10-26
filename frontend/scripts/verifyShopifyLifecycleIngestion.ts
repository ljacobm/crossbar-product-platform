import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCompleteSnapshotForLifecycleOrderTopic } from "@/lib/shopifyLifecycleOrderTopics";

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

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Shopify lifecycle ingestion/routing checks passed.");
}
