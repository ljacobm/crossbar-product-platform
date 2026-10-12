import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Phase 4D, Slice 3: automated, executable regression guards for the
// customer portal's privacy/isolation properties. Deliberately source-
// text inspection rather than behavioral tests against a real database:
// lib/portalAccess.ts, lib/salesCalculations.ts, and
// lib/customerPortalSalesData.ts all transitively import
// lib/supabase-admin.ts, which carries `import "server-only"` --
// exactly the same constraint documented in verifyPortalTokens.ts, that
// guard throws unconditionally outside Next's own bundler, so a plain
// script can never import (and therefore can never directly exercise)
// those modules. No real Supabase token has ever been generated in
// production either (generation has never been enabled), so there is no
// live fixture to test against even if the import problem were worked
// around.
//
// What these checks verify instead: that the specific properties this
// slice depends on for privacy/isolation are present in the actual
// source, not just asserted in a comment -- a real regression guard
// that will fail if someone later edits these files in a way that
// reintroduces a PII field, drops the store-id filter, or removes the
// token/notes exclusion. This is a deliberate, disclosed substitute for
// behavioral testing, not a replacement for it -- see the Slice 3 report
// for what remains unverified by an executable test in this
// environment.
//
// Run via `npx tsx scripts/verifyPortalPrivacy.ts`.

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

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "..", relativePath), "utf8");
}

// Strips `//` line comments so checks below can't produce a false
// positive from a comment that mentions a forbidden term specifically
// to explain its absence (e.g. "Sidebar is never imported here").
// Deliberately simple (no block-comment/string-literal awareness) --
// sufficient for this codebase's comment style, not a general-purpose
// JS parser.
function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function stripSqlComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const FORBIDDEN_PII_FIELDS = [
  "email",
  "phone",
  "shipping_address",
  "billing_address",
  "customer_note",
  "properties_text",
];

run("salesCalculations.ts select lists never reference customer PII columns", () => {
  const source = readSource("lib/salesCalculations.ts");
  // Matches both multi-line `...` template-literal selects and plain
  // "..."-string selects.
  const selectBlocks = [
    ...source.matchAll(/\.select\(\s*(?:`([\s\S]*?)`|"([^"]*)")/g),
  ].map((m) => m[1] ?? m[2]);
  assert.ok(selectBlocks.length >= 2, "expected at least two .select(...) calls to inspect");
  for (const block of selectBlocks) {
    for (const field of FORBIDDEN_PII_FIELDS) {
      assert.equal(block.includes(field), false, `select list unexpectedly references "${field}"`);
    }
    // "properties" (Shopify line-item personalization) is checked
    // separately from the word-boundary list above because it's a
    // common English word fragment -- check it as a distinct column
    // reference instead, e.g. `, properties` or `properties,`.
    assert.equal(/[,(]\s*properties\s*[,)]/.test(block), false);
  }
});

run("salesCalculations.ts never reads shopify_orders.total_price", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  assert.equal(source.includes("total_price"), false);
});

run("buildStoreSalesData always filters by the caller-supplied online_store_id", () => {
  const source = readSource("lib/salesCalculations.ts");
  assert.ok(source.includes('.eq("online_store_id", storeId)'));
});

run("customerPortalSalesData.ts uses an explicit field-by-field allowlist mapper, no unsafe casts", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  assert.ok(source.includes("function toCustomerSalesData(data: StoreSalesData): CustomerSalesData"));
  assert.ok(source.includes("toCustomerSalesData(salesData)"), "getCustomerPortalData must call the mapper");
  // No `as SomeType` cast anywhere in this file -- compatibility must
  // come from matching fields explicitly, not from forcing the type
  // checker to accept a shortcut.
  assert.equal(/\bas\s+[A-Z]\w*/.test(source), false, "found an unsafe type cast");
});

run("CustomerLineItem keeps item code (itemNumber) visible, per the approved field list", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const typeBlockMatch = source.match(/export type CustomerLineItem = \{([\s\S]*?)\n\};/);
  assert.ok(typeBlockMatch, "expected to find the CustomerLineItem type definition");
  assert.ok(/\bitemNumber\s*:/.test(typeBlockMatch![1]));
});

run("CustomerSalesData/CustomerPortalData never reference a token or token hash", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const typeSection = source.slice(
    source.indexOf("export type CustomerSalesSummary"),
    source.indexOf("async function getStoreNameAndRate")
  );
  assert.equal(/token/i.test(typeSection), false);
});

run("customerPortalSalesData.ts CustomerPayoutRow excludes notes", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const typeBlockMatch = source.match(/export type CustomerPayoutRow = \{([\s\S]*?)\n\};/);
  assert.ok(typeBlockMatch, "expected to find the CustomerPayoutRow type definition");
  // Checks for an actual field declaration ("notes:"), not just the
  // substring "notes" -- the type's own explanatory comment mentions
  // the word "notes" to say why it's absent, which would otherwise be a
  // false positive.
  assert.equal(/\bnotes\s*:/.test(typeBlockMatch![1]), false);
});

run("customerPortalSalesData.ts never reads shopify_customers", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  assert.equal(source.includes("shopify_customers"), false);
});

run("getCustomerPortalData's public signature never accepts a caller-supplied storeId", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const sigMatch = source.match(
    /export async function getCustomerPortalData\(([\s\S]*?)\):/
  );
  assert.ok(sigMatch, "expected to find getCustomerPortalData's signature");
  assert.equal(/storeId/i.test(sigMatch![1]), false);
});

run("getCustomerPortalData resolves the store id only via resolvePortalStoreId", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  assert.ok(source.includes("resolvePortalStoreId(rawToken)"));
});

run("portalAccess.ts never logs anything (no console.* calls)", () => {
  const source = readSource("lib/portalAccess.ts");
  assert.equal(/console\.\w+\(/.test(source), false);
});

run("portalAccess.ts validates token format before any database query", () => {
  const source = readSource("lib/portalAccess.ts");
  const formatCheckIndex = source.indexOf("isValidRawPortalTokenFormat(rawToken)");
  const firstQueryIndex = source.indexOf("supabaseAdmin\n    .from(");
  assert.ok(formatCheckIndex !== -1, "expected a format check");
  assert.ok(firstQueryIndex !== -1, "expected a supabaseAdmin query");
  assert.ok(formatCheckIndex < firstQueryIndex, "format check must run before the database query");
});

run("portalAccess.ts requires active = true and checks expiry in the query", () => {
  const source = readSource("lib/portalAccess.ts");
  assert.ok(source.includes('.eq("active", true)'));
  assert.ok(source.includes("expires_at.is.null"));
  assert.ok(source.includes("expires_at.gt."));
});

run("customer portal page imports no internal navigation component", () => {
  const source = stripLineComments(readSource("app/portal/[token]/page.tsx"));
  assert.equal(source.includes("Sidebar"), false);
});

run("customer portal page forces dynamic rendering", () => {
  const source = readSource("app/portal/[token]/page.tsx");
  assert.ok(source.includes('export const dynamic = "force-dynamic"'));
});

run("customer portal page checks the feature flag before resolving any token", () => {
  // Verified indirectly: getCustomerPortalData (called by the page) checks
  // isPortalGenerationEnabled() before calling resolvePortalStoreId.
  const source = readSource("lib/customerPortalSalesData.ts");
  const flagCheckIndex = source.indexOf("isPortalGenerationEnabled()");
  const resolveIndex = source.indexOf("resolvePortalStoreId(rawToken)");
  assert.ok(flagCheckIndex !== -1 && resolveIndex !== -1);
  assert.ok(flagCheckIndex < resolveIndex);
});

run("getCustomerPortalData enforces the pilot allowlist after token resolution, before any sales/payout query", () => {
  // Stripped of comments first: toCustomerPayout's own doc comment
  // mentions "buildStorePayouts()" (describing the shape it maps from)
  // well before the real call site, which would otherwise make this
  // check see a false, earlier "payout query" that was never a query.
  const source = stripLineComments(readSource("lib/customerPortalSalesData.ts"));
  const resolveIndex = source.indexOf("resolvePortalStoreId(rawToken)");
  const pilotCheckIndex = source.indexOf("isStoreAllowedForPilot(storeId)");
  const storeInfoIndex = source.indexOf("getStoreNameAndRate(storeId)");
  const salesQueryIndex = source.indexOf("buildStoreSalesData(");
  const payoutQueryIndex = source.indexOf("buildStorePayouts(");
  assert.ok(
    resolveIndex !== -1 && pilotCheckIndex !== -1 && storeInfoIndex !== -1,
    "expected to find all three checkpoints"
  );
  assert.ok(resolveIndex < pilotCheckIndex, "pilot check must run after token resolution");
  assert.ok(pilotCheckIndex < storeInfoIndex, "pilot check must run before the store info lookup");
  assert.ok(pilotCheckIndex < salesQueryIndex, "pilot check must run before any sales query");
  assert.ok(pilotCheckIndex < payoutQueryIndex, "pilot check must run before any payout query");
});

run("access tracking happens only after token validation AND pilot eligibility, never inside resolvePortalStoreId", () => {
  // resolvePortalStoreId() must only resolve/validate the token -- it
  // must never record access itself, since at that point pilot
  // eligibility hasn't been checked yet. (Slice 4A correction: it
  // previously called trackPortalAccess internally, which meant a
  // valid token for a non-pilot store still counted as a successful
  // visit.)
  const portalAccessSource = stripLineComments(readSource("lib/portalAccess.ts"));
  const resolveFnMatch = portalAccessSource.match(
    /export async function resolvePortalStoreId\([\s\S]*?\n\}/
  );
  assert.ok(resolveFnMatch, "expected to find resolvePortalStoreId's full body");
  assert.equal(
    /recordPortalAccess|trackPortalAccess/.test(resolveFnMatch![0]),
    false,
    "resolvePortalStoreId must not record access itself"
  );

  // recordPortalAccess must still exist, call the same atomic RPC, and
  // be exported so the caller can invoke it once authorization is
  // complete.
  assert.ok(portalAccessSource.includes("export async function recordPortalAccess"));
  assert.ok(portalAccessSource.includes('rpc("increment_portal_token_access"'));

  // The caller (getCustomerPortalData) must call recordPortalAccess
  // only after the pilot check, and before any store info lookup or
  // sales/payout query -- i.e. only once the request is fully
  // authorized, but still before data is actually queried.
  const dataPathSource = stripLineComments(readSource("lib/customerPortalSalesData.ts"));
  const pilotCheckIndex = dataPathSource.indexOf("isStoreAllowedForPilot(storeId)");
  const trackIndex = dataPathSource.indexOf("recordPortalAccess(tokenId)");
  const storeInfoIndex = dataPathSource.indexOf("getStoreNameAndRate(storeId)");
  const salesQueryIndex = dataPathSource.indexOf("buildStoreSalesData(");
  const payoutQueryIndex = dataPathSource.indexOf("buildStorePayouts(");
  assert.ok(
    pilotCheckIndex !== -1 && trackIndex !== -1,
    "expected both the pilot check and the access-tracking call"
  );
  assert.ok(pilotCheckIndex < trackIndex, "access tracking must run after the pilot check");
  assert.ok(trackIndex < storeInfoIndex, "access tracking must run before the store info lookup");
  assert.ok(trackIndex < salesQueryIndex, "access tracking must run before any sales query");
  assert.ok(trackIndex < payoutQueryIndex, "access tracking must run before any payout query");
});

run("generatePortalLink/regeneratePortalLink enforce the pilot allowlist; revokePortalLink does not", () => {
  const source = readSource("app/(internal)/stores/[storeId]/actions.ts");
  // Both generate and regenerate call the shared rotateToken(), which
  // contains the one isStoreAllowedForPilot() check -- confirm it's
  // present and runs before the store-existence lookup and before any
  // token is generated.
  const pilotCheckIndex = source.indexOf("isStoreAllowedForPilot(storeId)");
  const storeLookupIndex = source.indexOf('.from("online_stores")');
  const tokenGenIndex = source.indexOf("generateRawPortalToken()");
  assert.ok(pilotCheckIndex !== -1, "expected rotateToken() to check isStoreAllowedForPilot");
  assert.ok(pilotCheckIndex < storeLookupIndex);
  assert.ok(pilotCheckIndex < tokenGenIndex);

  // revokePortalLink must never reference either feature-flag function --
  // revoking stays available regardless of the pilot or deployment state.
  const revokeFnMatch = source.match(
    /export async function revokePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(revokeFnMatch, "expected to find revokePortalLink's full body");
  assert.equal(/isStoreAllowedForPilot|isPortalGenerationEnabled/.test(revokeFnMatch![0]), false);
});

run("PortalLinkSection never reveals the configured pilot store id", () => {
  // Stripped of comments first: this file's own top-of-component doc
  // comment names PORTAL_PILOT_STORE_ID and says "a single pilot store"
  // while explaining the design -- neither reaches the browser. What
  // this test actually guards is the rendered copy and the props/JSX
  // the component ships, not its author comments.
  const source = stripLineComments(readSource("components/PortalLinkSection.tsx"));
  // The component receives only a boolean (pilotEligible), never the
  // configured PORTAL_PILOT_STORE_ID value itself, and its copy never
  // names a specific store.
  assert.equal(source.includes("PORTAL_PILOT_STORE_ID"), false);
  assert.equal(/pilot store #?\d/i.test(source), false);
});

run("proxy.ts marks /portal public without weakening any existing prefix", () => {
  const source = readSource("proxy.ts");
  assert.ok(source.includes('"/login"'));
  assert.ok(source.includes('"/auth/callback"'));
  assert.ok(source.includes('"/api/webhooks/shopify"'));
  assert.ok(source.includes('"/portal"'));
});

run("next.config.ts applies a Referrer-Policy to the portal route", () => {
  const source = readSource("next.config.ts");
  assert.ok(source.includes('"/portal/:path*"'));
  assert.ok(source.includes("Referrer-Policy"));
  assert.ok(source.includes("no-referrer"));
});

run("portalAccess.ts tracks access via the atomic RPC, not a separate select-then-update", () => {
  const source = readSource("lib/portalAccess.ts");
  assert.ok(source.includes('supabaseAdmin.rpc("increment_portal_token_access"'));
  assert.equal(source.includes('.select("access_count")'), false, "old non-atomic read-then-write should be gone");
});

run("portalAccess.ts handles both a thrown exception and the RPC's returned error property", () => {
  const source = readSource("lib/portalAccess.ts");
  assert.ok(/try\s*\{/.test(source), "expected a try block for thrown exceptions");
  assert.ok(source.includes("if (error)"), "expected an explicit check of the RPC's returned error");
});

run("increment_portal_token_access migration matches the deployed production function", () => {
  const rawSource = readSource("../database/migrations/20261012_add_increment_portal_token_access.sql");
  const source = stripSqlComments(rawSource);
  assert.ok(source.includes("create or replace function public.increment_portal_token_access"));
  assert.ok(source.includes("security invoker"));
  assert.ok(source.includes("set search_path = ''"));
  assert.ok(
    source.includes(
      "revoke all on function public.increment_portal_token_access(bigint) from public, anon, authenticated"
    )
  );
  assert.ok(
    source.includes("grant execute on function public.increment_portal_token_access(bigint) to service_role")
  );
  // No dynamic SQL.
  assert.equal(/\bexecute\s+format\(|\bformat\(/i.test(source), false);
  // No new RLS policy or table/sequence grant introduced.
  assert.equal(source.includes("create policy"), false);
  assert.equal(/\bgrant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?public\.\w+\s+to/i.test(source), false);

  // Isolate the function body (between `as $$` and the closing `$$;`) to
  // precisely separate its SET clause (what it writes) from its WHERE
  // clause (what it reads/re-validates) -- a naive "does 'active' appear
  // anywhere after 'set'" scan would misread the WHERE clause's
  // defensive active/expiry re-check as if it were an assignment.
  const bodyMatch = source.match(/as \$\$([\s\S]*?)\$\$;/);
  assert.ok(bodyMatch, "expected to find the function body between as $$ ... $$;");
  const body = bodyMatch![1];
  const setClauseMatch = body.match(/set([\s\S]*?)where/i);
  assert.ok(setClauseMatch, "expected a SET clause followed by a WHERE clause");
  const setClause = setClauseMatch![1];
  const whereClause = body.slice(body.indexOf(setClauseMatch![0]) + setClauseMatch![0].length);

  // The SET clause only ever assigns the two analytics columns --
  // it must never assign active, token_hash, expires_at, or
  // online_store_id (the function must not alter token authorization
  // state).
  assert.ok(/\baccess_count\s*=/.test(setClause));
  assert.ok(/\blast_accessed_at\s*=/.test(setClause));
  assert.equal(/\bactive\s*=/.test(setClause), false, "SET clause must not assign active");
  assert.equal(/\btoken_hash\s*=/.test(setClause), false, "SET clause must not assign token_hash");
  assert.equal(/\bexpires_at\s*=/.test(setClause), false, "SET clause must not assign expires_at");
  assert.equal(/\bonline_store_id\s*=/.test(setClause), false, "SET clause must not assign online_store_id");

  // The WHERE clause re-validates id, active = true, and the
  // not-expired condition -- read-only re-checks, matching
  // resolvePortalStoreId()'s own validation.
  assert.ok(whereClause.includes("id = p_token_id"));
  assert.ok(whereClause.includes("active = true"));
  assert.ok(whereClause.includes("expires_at is null"));
  assert.ok(whereClause.includes("expires_at > now()"));
});

run("existing staff Sales page file is untouched by this slice", () => {
  // Structural sanity check, not a behavioral one -- confirms the file
  // still calls the same two functions with the same shape it always
  // has, i.e. nothing in Slice 3 rewired it.
  const source = readSource("app/(internal)/stores/[storeId]/sales/page.tsx");
  assert.ok(source.includes("getStoreSalesData(store.id, store.fundraiser_rate, range)"));
  assert.ok(source.includes("getStorePayouts(store.id)"));
  assert.ok(source.includes("requireStaffSession") === false); // page itself never calls it directly -- unchanged from before
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll portal privacy/isolation source checks passed.");
}
