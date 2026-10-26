import "server-only";
import {
  isShopifyLifecycleTopicEnabledLogic,
  isShopifyDiscountCaptureEnabledLogic,
  isKnownShopifyLifecycleTopic,
  SHOPIFY_LIFECYCLE_TOPICS,
  type ShopifyLifecycleTopic,
} from "@/lib/shopifyLifecycleFlagsLogic";

export { isKnownShopifyLifecycleTopic, SHOPIFY_LIFECYCLE_TOPICS, type ShopifyLifecycleTopic };

// Phase 1, Milestone 2: the actual, enforced gates for the new Shopify
// lifecycle webhook topics -- not just documentation. The real logic
// lives in lib/shopifyLifecycleFlagsLogic.ts, a plain module without
// this guard (so it stays independently testable); this file is the
// only one application code should import from, since it's the one
// that guarantees neither env var can ever reach the client bundle.
// Both are deliberately NOT prefixed NEXT_PUBLIC_ for that reason.
export function isShopifyLifecycleTopicEnabled(topic: string): boolean {
  return isShopifyLifecycleTopicEnabledLogic(topic, process.env);
}

export function isShopifyDiscountCaptureEnabled(): boolean {
  return isShopifyDiscountCaptureEnabledLogic(process.env);
}
