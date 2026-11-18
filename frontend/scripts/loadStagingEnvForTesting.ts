import { readFileSync } from "fs";
import { resolve } from "path";
import { createRequire } from "node:module";

// "server-only" (the marker package lib/supabase-admin.ts and every
// "use server" lib module import) unconditionally throws outside
// Next's bundler -- its `react-server` export condition (which
// resolves it to a no-op) only exists inside webpack/turbopack, not
// under tsx's plain CJS/ESM execution. Every existing standalone
// script in this repo that needs real data access works around this
// by reimplementing its own Supabase client rather than importing
// supabase-admin.ts (see scripts/backfillShopifyOrders.ts). This
// script instead pre-seeds Node's CJS require cache with a no-op
// stand-in BEFORE anything requires "server-only", so this test suite
// can import and exercise the REAL application library functions
// (submitCustomerCatalogForReview, decide_catalog_submission_item's
// TS wrapper, etc.) directly, which is what an "end-to-end" test
// bypassing only an unrelated bundler-only marker should do.
const require_ = createRequire(__filename);
const serverOnlyPath = require_.resolve("server-only");
require_.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeJS.Module;

// STAGING-ONLY env loader for standalone regression-test scripts (e.g.
// testCreator3ApprovalWorkflowStaging.ts). Deliberately SEPARATE from
// scripts/loadEnv.ts, which loads frontend/.env.local -- that file
// points at MAIN (NEXT_PUBLIC_SUPABASE_URL=https://cirzayyyqxvrkkzfbyjb...).
// This loader instead reads the repo-root .env's SANMAR_SYNC_STAGING_*
// variables (the same staging project credentials
// sanmar_api/sync_inventory.py and verify_staging_connection.py already
// use) and maps them onto the variable names lib/supabase-admin.ts
// actually reads (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY),
// so importing any "use server" lib module after this loader talks to
// STAGING, never MAIN.
//
// Refuses to proceed if the resolved project ref isn't EXACTLY
// tarrtjnthuxawzjpdxts (Crossbar OS Staging) -- same fail-closed
// ref-match safety check as sanmar_api/verify_staging_connection.py,
// ported to TypeScript so this script family has the identical
// guarantee the Python staging scripts already have.

const EXPECTED_STAGING_REF = "tarrtjnthuxawzjpdxts";

const rootEnvPath = resolve(__dirname, "..", "..", ".env");
const contents = readFileSync(rootEnvPath, "utf8");
const values: Record<string, string> = {};
for (const line of contents.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex).trim();
  let value = trimmed.slice(eqIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  values[key] = value;
}

const stagingUrl = values["SANMAR_SYNC_STAGING_SUPABASE_URL"];
const stagingKey = values["SANMAR_SYNC_STAGING_SUPABASE_SERVICE_ROLE_KEY"];
const allowedRef = values["SANMAR_SYNC_STAGING_PROJECT_REF"];

if (!stagingUrl || !stagingKey || !allowedRef) {
  throw new Error(
    "Missing SANMAR_SYNC_STAGING_SUPABASE_URL / _SERVICE_ROLE_KEY / _PROJECT_REF in repo-root .env -- refusing to run any staging test."
  );
}

const refMatch = stagingUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
const actualRef = refMatch ? refMatch[1] : null;

if (actualRef !== EXPECTED_STAGING_REF || actualRef !== allowedRef) {
  throw new Error(
    `Staging project ref mismatch -- refusing to connect. URL ref: ${actualRef}, ` +
      `.env's own PROJECT_REF: ${allowedRef}, expected: ${EXPECTED_STAGING_REF}.`
  );
}

process.env.NEXT_PUBLIC_SUPABASE_URL = stagingUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = stagingKey;
// Dummy -- only consumed by catalogAccessActions.ts's URL-building
// helper; this script never serves or visits a real page, it only
// needs the raw token value, not a working link.
process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

console.log(`[loadStagingEnvForTesting] Connected target: STAGING (${actualRef}) -- confirmed, not MAIN.`);
