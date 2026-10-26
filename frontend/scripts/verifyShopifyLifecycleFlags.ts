import assert from "node:assert/strict";
import {
  isShopifyLifecycleTopicEnabledLogic,
  isShopifyDiscountCaptureEnabledLogic,
  parseEnabledShopifyLifecycleTopicsLogic,
  isKnownShopifyLifecycleTopic,
  SHOPIFY_LIFECYCLE_TOPICS,
  type ShopifyLifecycleEnv,
} from "@/lib/shopifyLifecycleFlagsLogic";

// Phase 1, Milestone 2: executable tests for the Shopify lifecycle
// feature-flag logic. Imports from lib/shopifyLifecycleFlagsLogic.ts
// (no `server-only` guard), not lib/shopifyLifecycleFlags.ts -- the
// latter carries the guard, which throws unconditionally outside
// Next's own bundler, so a plain script can never import it (same
// constraint documented in verifyPortalFeatureFlag.ts).
//
// Run via `npx tsx scripts/verifyShopifyLifecycleFlags.ts`.

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

function env(overrides: ShopifyLifecycleEnv = {}): ShopifyLifecycleEnv {
  return { ...overrides };
}

run("unset SHOPIFY_LIFECYCLE_TOPICS_ENABLED -> every topic disabled (fails closed)", () => {
  const e = env();
  for (const topic of SHOPIFY_LIFECYCLE_TOPICS) {
    assert.equal(isShopifyLifecycleTopicEnabledLogic(topic, e), false, `expected ${topic} disabled`);
  }
  assert.equal(parseEnabledShopifyLifecycleTopicsLogic(e).size, 0);
});

run("empty-string SHOPIFY_LIFECYCLE_TOPICS_ENABLED -> every topic disabled", () => {
  const e = env({ SHOPIFY_LIFECYCLE_TOPICS_ENABLED: "" });
  assert.equal(isShopifyLifecycleTopicEnabledLogic("orders/updated", e), false);
});

run("a single enabled topic enables only that topic, not siblings", () => {
  const e = env({ SHOPIFY_LIFECYCLE_TOPICS_ENABLED: "orders/updated" });
  assert.equal(isShopifyLifecycleTopicEnabledLogic("orders/updated", e), true);
  assert.equal(isShopifyLifecycleTopicEnabledLogic("orders/cancelled", e), false);
  assert.equal(isShopifyLifecycleTopicEnabledLogic("fulfillments/create", e), false);
});

run("multiple comma-separated topics, with surrounding whitespace, all parse correctly", () => {
  const e = env({
    SHOPIFY_LIFECYCLE_TOPICS_ENABLED: " orders/updated, orders/cancelled ,fulfillments/create",
  });
  assert.equal(isShopifyLifecycleTopicEnabledLogic("orders/updated", e), true);
  assert.equal(isShopifyLifecycleTopicEnabledLogic("orders/cancelled", e), true);
  assert.equal(isShopifyLifecycleTopicEnabledLogic("fulfillments/create", e), true);
  assert.equal(isShopifyLifecycleTopicEnabledLogic("fulfillments/update", e), false);
  assert.equal(isShopifyLifecycleTopicEnabledLogic("refunds/create", e), false);
});

run("orders/create is never gated by this flag -- it is not a recognized lifecycle topic at all", () => {
  assert.equal(isKnownShopifyLifecycleTopic("orders/create"), false);
  for (const topic of SHOPIFY_LIFECYCLE_TOPICS) {
    assert.notEqual(topic, "orders/create");
  }
});

run("every topic the webhook route checks is a known lifecycle topic", () => {
  const expected = [
    "orders/updated",
    "orders/cancelled",
    "orders/edited",
    "fulfillments/create",
    "fulfillments/update",
    "refunds/create",
  ];
  assert.deepEqual([...SHOPIFY_LIFECYCLE_TOPICS].sort(), expected.sort());
  for (const topic of expected) {
    assert.equal(isKnownShopifyLifecycleTopic(topic), true);
  }
  assert.equal(isKnownShopifyLifecycleTopic("something/unrelated"), false);
});

run('SHOPIFY_CAPTURE_DISCOUNTS requires exactly "true" -- fails closed on anything else', () => {
  for (const value of [undefined, "", "false", "1", "TRUE", "yes"]) {
    const e = env(value === undefined ? {} : { SHOPIFY_CAPTURE_DISCOUNTS: value });
    assert.equal(isShopifyDiscountCaptureEnabledLogic(e), false, `expected "${value}" to mean disabled`);
  }
  assert.equal(isShopifyDiscountCaptureEnabledLogic(env({ SHOPIFY_CAPTURE_DISCOUNTS: "true" })), true);
});

run("the two flags are independent -- discount capture does not imply any topic is enabled, and vice versa", () => {
  const discountsOnlyEnv = env({ SHOPIFY_CAPTURE_DISCOUNTS: "true" });
  assert.equal(isShopifyDiscountCaptureEnabledLogic(discountsOnlyEnv), true);
  assert.equal(isShopifyLifecycleTopicEnabledLogic("orders/updated", discountsOnlyEnv), false);

  const topicsOnlyEnv = env({ SHOPIFY_LIFECYCLE_TOPICS_ENABLED: "orders/updated" });
  assert.equal(isShopifyLifecycleTopicEnabledLogic("orders/updated", topicsOnlyEnv), true);
  assert.equal(isShopifyDiscountCaptureEnabledLogic(topicsOnlyEnv), false);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Shopify lifecycle flag checks passed.");
}
