import "server-only";
import {
  isPortalGenerationEnabledLogic,
  isStoreAllowedForPilotLogic,
} from "@/lib/portalFeatureFlagLogic";

// Phase 4D, Slice 2/4A: the actual, enforced gates on portal token
// generation/regeneration and on the customer data-serving path -- not
// just client-side UI disables. The real logic lives in
// lib/portalFeatureFlagLogic.ts, a plain module without this guard (so
// it stays independently testable); this file is the only one
// application code should import from, since it's the one that
// guarantees neither PORTAL_PUBLIC_ROUTE_ENABLED nor
// PORTAL_PILOT_STORE_ID can ever reach the client bundle. Both env vars
// are deliberately NOT prefixed NEXT_PUBLIC_ for exactly that reason.
//
// isPortalGenerationEnabled() defaults to disabled (false) whenever
// PORTAL_PUBLIC_ROUTE_ENABLED is unset or anything other than exactly
// "true", so a missing/misconfigured environment variable fails closed,
// not open.
//
// isStoreAllowedForPilot(storeId) is a second, narrower, independent
// gate on top of the first: true only when the global flag is also on
// AND storeId exactly matches PORTAL_PILOT_STORE_ID (a single internal
// online_stores.id, never a store name). Every caller -- staff link
// generation and the customer data-serving path alike -- calls this one
// function rather than re-implementing the "both conditions" check, so
// the two can never drift apart from each other.
//
// The only thing either function exposes outward is its boolean return
// value -- not a secret, just a yes/no -- which the Overview page (a
// Server Component) reads and passes down to PortalLinkSection (a
// Client Component) as an ordinary prop, so the UI's disabled state and
// the server's actual enforcement can never drift out of sync with each
// other.
export function isPortalGenerationEnabled(): boolean {
  return isPortalGenerationEnabledLogic(process.env);
}

export function isStoreAllowedForPilot(storeId: number): boolean {
  return isStoreAllowedForPilotLogic(storeId, process.env);
}
