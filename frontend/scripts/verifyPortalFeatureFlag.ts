import assert from "node:assert/strict";
import {
  isPortalGenerationEnabledLogic,
  getPilotAllowedStoreIdLogic,
  isStoreAllowedForPilotLogic,
  type PortalFeatureEnv,
} from "@/lib/portalFeatureFlagLogic";

// Phase 4D, Slice 4A: executable tests for the pilot-allowlist logic.
// Imports from lib/portalFeatureFlagLogic.ts (no `server-only` guard),
// not lib/portalFeatureFlag.ts -- the latter carries the guard, which
// throws unconditionally outside Next's own bundler, so a plain script
// can never import it (same constraint documented in
// verifyPortalTokens.ts and verifyPortalPrivacy.ts). Each function
// under test takes an explicit env object rather than reading
// process.env directly, so these cases don't need to mutate global
// process.env between runs.
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

const PILOT_STORE_ID = 42;
const OTHER_STORE_ID = 7;

function env(overrides: PortalFeatureEnv = {}): PortalFeatureEnv {
  return { ...overrides };
}

run("both flags unset -> generation disabled, no pilot store allowed, no store matches", () => {
  const e = env();
  assert.equal(isPortalGenerationEnabledLogic(e), false);
  assert.equal(getPilotAllowedStoreIdLogic(e), null);
  assert.equal(isStoreAllowedForPilotLogic(PILOT_STORE_ID, e), false);
});

run("global flag enabled but pilot store id unset -> no store is allowed", () => {
  const e = env({ PORTAL_PUBLIC_ROUTE_ENABLED: "true" });
  assert.equal(isPortalGenerationEnabledLogic(e), true);
  assert.equal(getPilotAllowedStoreIdLogic(e), null);
  assert.equal(isStoreAllowedForPilotLogic(PILOT_STORE_ID, e), false);
});

run("pilot store id configured but global flag disabled -> no store is allowed", () => {
  const e = env({ PORTAL_PILOT_STORE_ID: String(PILOT_STORE_ID) });
  assert.equal(isPortalGenerationEnabledLogic(e), false);
  assert.equal(getPilotAllowedStoreIdLogic(e), PILOT_STORE_ID);
  assert.equal(isStoreAllowedForPilotLogic(PILOT_STORE_ID, e), false);
});

run("both enabled with matching store id -> allowed", () => {
  const e = env({
    PORTAL_PUBLIC_ROUTE_ENABLED: "true",
    PORTAL_PILOT_STORE_ID: String(PILOT_STORE_ID),
  });
  assert.equal(isStoreAllowedForPilotLogic(PILOT_STORE_ID, e), true);
});

run("both enabled with a nonmatching store id -> denied", () => {
  const e = env({
    PORTAL_PUBLIC_ROUTE_ENABLED: "true",
    PORTAL_PILOT_STORE_ID: String(PILOT_STORE_ID),
  });
  assert.equal(isStoreAllowedForPilotLogic(OTHER_STORE_ID, e), false);
});

run("invalid store id configuration fails closed, never open", () => {
  const base = { PORTAL_PUBLIC_ROUTE_ENABLED: "true" };
  const invalidValues = ["abc", "", "0", "-5", "3.5", "NaN", "  ", "42abc"];
  for (const value of invalidValues) {
    const e = env({ ...base, PORTAL_PILOT_STORE_ID: value });
    assert.equal(
      getPilotAllowedStoreIdLogic(e),
      null,
      `expected "${value}" to resolve to no allowed store`
    );
    assert.equal(
      isStoreAllowedForPilotLogic(PILOT_STORE_ID, e),
      false,
      `expected "${value}" to deny every store, including ${PILOT_STORE_ID}`
    );
  }
});

run("a non-\"true\" value for the global flag is always treated as disabled", () => {
  for (const value of ["false", "1", "TRUE", "yes", ""]) {
    const e = env({ PORTAL_PUBLIC_ROUTE_ENABLED: value, PORTAL_PILOT_STORE_ID: String(PILOT_STORE_ID) });
    assert.equal(isPortalGenerationEnabledLogic(e), false, `expected "${value}" to mean disabled`);
    assert.equal(isStoreAllowedForPilotLogic(PILOT_STORE_ID, e), false);
  }
});

run("the pilot check never allows a store merely because its id is a prefix/substring match", () => {
  // Guards against a naive string-comparison implementation -- this
  // function compares as numbers, so "420" must not match pilot id 42.
  const e = env({
    PORTAL_PUBLIC_ROUTE_ENABLED: "true",
    PORTAL_PILOT_STORE_ID: String(PILOT_STORE_ID),
  });
  assert.equal(isStoreAllowedForPilotLogic(420, e), false);
  assert.equal(isStoreAllowedForPilotLogic(4, e), false);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll portal feature-flag checks passed.");
}
