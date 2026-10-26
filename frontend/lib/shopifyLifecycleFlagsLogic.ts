// Pure, env-driven feature-flag logic for Phase 1 Shopify lifecycle sync
// -- deliberately without the `server-only` guard, so
// scripts/verifyShopifyLifecycleFlags.ts can exercise it directly with
// real, executable tests. See lib/portalFeatureFlagLogic.ts for the
// same split applied to the portal work, for the same reason:
// `server-only` throws unconditionally outside Next's own bundler, so a
// plain script can never import a module that carries it.
//
// lib/shopifyLifecycleFlags.ts is the only module application code
// should import from -- it re-exports everything here behind the
// `server-only` guard.
//
// Two independent switches:
//   SHOPIFY_LIFECYCLE_TOPICS_ENABLED -- a comma-separated allowlist of
//     which NEW webhook topics (orders/updated, orders/cancelled,
//     orders/edited, fulfillments/create, fulfillments/update,
//     refunds/create) actually get processed. Unset/empty means none of
//     them do -- a recognized-but-not-enabled topic is recorded in the
//     audit table and marked processed, exactly like an unrecognized
//     topic is today, never partially applied. orders/create is NEVER
//     gated by this flag -- it isn't a "new lifecycle topic," it's the
//     existing, always-on path (see ingest.ts), explicitly so the live
//     production webhook keeps working unchanged regardless of this
//     flag's state or whether the new Postgres functions it would
//     otherwise call even exist yet in that environment.
//   SHOPIFY_CAPTURE_DISCOUNTS -- independently gates whether discount
//     data is ever written, even for an enabled order-lifecycle topic.
//     Checked by the caller (ingestLifecycle.ts) before invoking the
//     RPC layer -- when disabled, discounts are treated as "not
//     provided" (SQL NULL, "no opinion"), never as "confirmed empty."

export type ShopifyLifecycleEnv = {
  SHOPIFY_LIFECYCLE_TOPICS_ENABLED?: string;
  SHOPIFY_CAPTURE_DISCOUNTS?: string;
  // Index signature so this type structurally matches NodeJS.ProcessEnv
  // without TypeScript's "weak type" rule rejecting the two as
  // unrelated -- same fix already applied to PortalFeatureEnv.
  [key: string]: string | undefined;
};

export const SHOPIFY_LIFECYCLE_TOPICS = [
  "orders/updated",
  "orders/cancelled",
  "orders/edited",
  "fulfillments/create",
  "fulfillments/update",
  "refunds/create",
] as const;

export type ShopifyLifecycleTopic = (typeof SHOPIFY_LIFECYCLE_TOPICS)[number];

export function isKnownShopifyLifecycleTopic(topic: string): topic is ShopifyLifecycleTopic {
  return (SHOPIFY_LIFECYCLE_TOPICS as readonly string[]).includes(topic);
}

export function parseEnabledShopifyLifecycleTopicsLogic(env: ShopifyLifecycleEnv): Set<string> {
  const raw = env.SHOPIFY_LIFECYCLE_TOPICS_ENABLED;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0)
  );
}

export function isShopifyLifecycleTopicEnabledLogic(
  topic: string,
  env: ShopifyLifecycleEnv
): boolean {
  return parseEnabledShopifyLifecycleTopicsLogic(env).has(topic);
}

export function isShopifyDiscountCaptureEnabledLogic(env: ShopifyLifecycleEnv): boolean {
  return env.SHOPIFY_CAPTURE_DISCOUNTS === "true";
}
