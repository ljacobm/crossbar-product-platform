import assert from "node:assert/strict";
import {
  isPortalGenerationEnabledLogic,
  type PortalFeatureEnv,
} from "@/lib/portalFeatureFlagLogic";

// Phase 4D, Slice 4A / Phase 4E: executable tests for the portal's one
// remaining global switch. Imports from lib/portalFeatureFlagLogic.ts
// (no `server-only` guard), not lib/portalFeatureFlag.ts -- the latter
// carries the guard, which throws unconditionally outside Next's own
// bundler, so a plain script can never import it (same constraint
// documented in verifyPortalTokens.ts and verifyPortalPrivacy.ts).
//
// Phase 4E: the single-store pilot allowlist
// (getPilotAllowedStoreIdLogic/isStoreAllowedForPilotLogic and the test
// cases that exercised them, formerly in this file) has been removed --
// the portal now works for every online_store_id, so there is nothing
// store-specific left to test here. What remains is purely the global
// PORTAL_PUBLIC_ROUTE_ENABLED switch's own fail-closed behavior.
//
// Run via `npx tsx scripts/verifyPortalFeatureFlag.ts`.

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

function env(overrides: PortalFeatureEnv = {}): PortalFeatureEnv {
  return { ...overrides };
}

run("unset -> generation disabled (fails closed)", () => {
  assert.equal(isPortalGenerationEnabledLogic(env()), false);
});

run('exactly "true" -> generation enabled', () => {
  assert.equal(isPortalGenerationEnabledLogic(env({ PORTAL_PUBLIC_ROUTE_ENABLED: "true" })), true);
});

run("any non-\"true\" value is always treated as disabled", () => {
  for (const value of ["false", "1", "TRUE", "True", "yes", "", "  true", "true "]) {
    assert.equal(
      isPortalGenerationEnabledLogic(env({ PORTAL_PUBLIC_ROUTE_ENABLED: value })),
      false,
      `expected "${value}" to mean disabled`
    );
  }
});

run("the flag is global -- its result does not take or depend on a store id", () => {
  // isPortalGenerationEnabledLogic takes only an env object -- there is
  // no storeId parameter for a caller to pass, by construction. This is
  // a type-level guarantee as much as a runtime one, but asserting the
  // function's arity here keeps it an executable, regression-proof
  // check rather than just a comment.
  assert.equal(isPortalGenerationEnabledLogic.length, 1);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll portal feature-flag checks passed.");
}
