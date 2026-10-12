import "server-only";
import { isPortalGenerationEnabledLogic } from "@/lib/portalFeatureFlagLogic";

// Phase 4D, Slice 2: the actual, enforced gate on portal token
// generation/regeneration and on the customer data-serving path -- not
// just a client-side UI disable. The real logic lives in
// lib/portalFeatureFlagLogic.ts, a plain module without this guard (so
// it stays independently testable); this file is the only one
// application code should import from, since it's the one that
// guarantees PORTAL_PUBLIC_ROUTE_ENABLED can never reach the client
// bundle. The env var is deliberately NOT prefixed NEXT_PUBLIC_ for
// exactly that reason.
//
// isPortalGenerationEnabled() defaults to disabled (false) whenever
// PORTAL_PUBLIC_ROUTE_ENABLED is unset or anything other than exactly
// "true", so a missing/misconfigured environment variable fails closed,
// not open. This is the one global switch for the whole portal: when
// true, every valid online_store_id's link management and customer
// data-serving work normally; when false, public access is denied and
// staff can no longer generate or regenerate links (revoking an
// existing link is never gated by this flag -- see
// app/(internal)/stores/[storeId]/actions.ts).
//
// Phase 4E: the single-store pilot restriction
// (isStoreAllowedForPilot/PORTAL_PILOT_STORE_ID) has been removed. The
// portal is available for every online_store_id by default -- a store
// having an active link is controlled entirely by whether staff have
// generated one for it, never by its id. This function is not replaced
// by any other per-store allowlist.
//
// The only thing this function exposes outward is its boolean return
// value -- not a secret, just a yes/no -- which the Overview page (a
// Server Component) reads and passes down to PortalLinkSection (a
// Client Component) as an ordinary prop, so the UI's disabled state and
// the server's actual enforcement can never drift out of sync with each
// other.
export function isPortalGenerationEnabled(): boolean {
  return isPortalGenerationEnabledLogic(process.env);
}
