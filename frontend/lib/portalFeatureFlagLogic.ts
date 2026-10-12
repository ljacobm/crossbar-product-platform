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

export type PortalFeatureEnv = {
  PORTAL_PUBLIC_ROUTE_ENABLED?: string;
  PORTAL_PILOT_STORE_ID?: string;
  // Index signature so this type structurally matches NodeJS.ProcessEnv
  // (also index-signature-shaped) without TypeScript's "weak type" rule
  // (all-optional-properties types require at least one matching named
  // property, not just index-signature compatibility) rejecting the two
  // as unrelated.
  [key: string]: string | undefined;
};

export function isPortalGenerationEnabledLogic(env: PortalFeatureEnv): boolean {
  return env.PORTAL_PUBLIC_ROUTE_ENABLED === "true";
}

// Fails closed on every kind of misconfiguration: unset, non-numeric,
// zero, negative, or non-integer all resolve to "no store is allowed" --
// never to "every store is allowed" and never to a thrown error that
// could surface an internal detail.
export function getPilotAllowedStoreIdLogic(env: PortalFeatureEnv): number | null {
  const raw = env.PORTAL_PILOT_STORE_ID;
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;

  return parsed;
}

export function isStoreAllowedForPilotLogic(storeId: number, env: PortalFeatureEnv): boolean {
  if (!isPortalGenerationEnabledLogic(env)) return false;

  const allowedStoreId = getPilotAllowedStoreIdLogic(env);
  if (allowedStoreId === null) return false;

  return storeId === allowedStoreId;
}
