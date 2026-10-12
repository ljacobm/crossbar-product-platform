// Pure, env-driven feature-flag logic -- deliberately without the
// `server-only` guard, so scripts/verifyPortalFeatureFlag.ts can
// exercise it directly with real, executable tests. See
// lib/portalTokenCrypto.ts for the same split applied to the token
// crypto helpers, for the same reason: `server-only` throws
// unconditionally outside Next's own bundler (it only resolves to a
// no-op under the internal "react-server" export condition), so a plain
// script can never import a module that carries it.
//
// lib/portalFeatureFlag.ts is the only module application code should
// import from -- it re-exports everything here behind the `server-only`
// guard. Each function here takes an explicit env object rather than
// reading `process.env` directly, so tests can pass a fake env without
// mutating global process.env between cases.
//
// Phase 4E: PORTAL_PILOT_STORE_ID and the per-store allowlist it backed
// (getPilotAllowedStoreIdLogic/isStoreAllowedForPilotLogic, formerly
// here) are removed -- the Customer Fundraising Portal is now available
// for every online_store_id, not a single pilot store, and is not
// replaced by any other per-store allowlist. PORTAL_PUBLIC_ROUTE_ENABLED
// is the only remaining gate: a single global switch, checked by exact
// string comparison against "true", that fails closed (disabled) when
// unset or set to anything else.

export type PortalFeatureEnv = {
  PORTAL_PUBLIC_ROUTE_ENABLED?: string;
  // Index signature so this type structurally matches NodeJS.ProcessEnv
  // (also index-signature-shaped) without TypeScript's "weak type" rule
  // (an all-optional-properties type needs at least one matching named
  // property, not just index-signature compatibility, to be considered
  // related to another type) rejecting the two as unrelated.
  [key: string]: string | undefined;
};

export function isPortalGenerationEnabledLogic(env: PortalFeatureEnv): boolean {
  return env.PORTAL_PUBLIC_ROUTE_ENABLED === "true";
}
