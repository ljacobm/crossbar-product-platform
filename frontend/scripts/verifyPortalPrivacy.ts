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

run("financial queries are scoped at the line-item level (shopify_order_line_items.online_store_id), never by a whole Shopify order's store", () => {
  // A single Shopify order can contain line items belonging to
  // different online stores -- scoping by the order's own store (if
  // orders even had one) or by order total would leak another store's
  // sales into this store's totals. buildStoreSalesData must query
  // shopify_order_line_items directly and filter THAT table's
  // online_store_id, with shopify_orders joined only for display
  // context (order number/date/cancellation), never as the scoping
  // table itself.
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  const fnMatch = source.match(/export async function buildStoreSalesData\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected to find buildStoreSalesData's full body");
  const body = fnMatch![0];

  const fromIndex = body.indexOf('.from("shopify_order_line_items")');
  const filterIndex = body.indexOf('.eq("online_store_id", storeId)');
  assert.ok(fromIndex !== -1, "expected the query to target shopify_order_line_items");
  assert.ok(filterIndex !== -1 && filterIndex > fromIndex, "expected the online_store_id filter on that query");

  // shopify_orders is joined (for order_number/order_created_at/
  // cancelled_at display fields only) but must never itself be the
  // `.from()` table, and must never be filtered by online_store_id --
  // if it were, that would imply orders carry their own store id,
  // which would be the wrong scoping granularity for a cross-store
  // order.
  assert.equal(body.includes('.from("shopify_orders")'), false);

  // buildStorePayouts is also scoped by the same resolved storeId, on
  // its own dedicated table -- payouts are never derived from Shopify
  // orders at all.
  const payoutFnMatch = source.match(/export async function buildStorePayouts\([\s\S]*?\n\}/);
  assert.ok(payoutFnMatch, "expected to find buildStorePayouts's full body");
  assert.ok(payoutFnMatch![0].includes('.from("online_store_payouts")'));
  assert.ok(payoutFnMatch![0].includes('.eq("online_store_id", storeId)'));
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

run("Phase 4E: no per-store pilot allowlist remains anywhere in the portal source", () => {
  // The single-store pilot restriction (isStoreAllowedForPilot,
  // PORTAL_PILOT_STORE_ID, and the "pilot" vocabulary it introduced) is
  // fully removed, not replaced by any other per-store check --
  // confirming its absence here, in one place, is a stronger guard than
  // scattering "must not contain X" assertions across every individual
  // test below.
  const files = [
    "lib/portalFeatureFlag.ts",
    "lib/portalFeatureFlagLogic.ts",
    "lib/customerPortalSalesData.ts",
    "app/(internal)/stores/[storeId]/actions.ts",
    "app/(internal)/stores/[storeId]/overview/page.tsx",
    "components/PortalLinkSection.tsx",
  ];
  for (const file of files) {
    const source = stripLineComments(readSource(file));
    assert.equal(
      source.includes("isStoreAllowedForPilot"),
      false,
      `${file} must not reference isStoreAllowedForPilot`
    );
    assert.equal(
      source.includes("PORTAL_PILOT_STORE_ID"),
      false,
      `${file} must not reference PORTAL_PILOT_STORE_ID`
    );
    assert.equal(
      source.includes("pilotEligible"),
      false,
      `${file} must not reference a pilotEligible prop/value`
    );
  }
});

run("getCustomerPortalData records access and serves data for the storeId resolved from ANY valid token, before any sales/payout query", () => {
  // Phase 4E: there is no pilot check left to enforce an ordering
  // against -- this test instead confirms the remaining ordering
  // (token resolution -> access tracking -> store info -> sales/payout
  // queries) still holds for every store, not just one allowlisted id.
  // Stripped of comments first: toCustomerPayout's own doc comment
  // mentions "buildStorePayouts()" (describing the shape it maps from)
  // well before the real call site, which would otherwise make this
  // check see a false, earlier "payout query" that was never a query.
  const source = stripLineComments(readSource("lib/customerPortalSalesData.ts"));
  const resolveIndex = source.indexOf("resolvePortalStoreId(rawToken)");
  const trackIndex = source.indexOf("recordPortalAccess(tokenId)");
  const storeInfoIndex = source.indexOf("getStoreNameAndRate(storeId)");
  const salesQueryIndex = source.indexOf("buildStoreSalesData(");
  const payoutQueryIndex = source.indexOf("buildStorePayouts(");
  assert.ok(
    resolveIndex !== -1 && trackIndex !== -1 && storeInfoIndex !== -1,
    "expected to find all checkpoints"
  );
  assert.ok(resolveIndex < trackIndex, "access tracking must run after token resolution");
  assert.ok(trackIndex < storeInfoIndex, "access tracking must run before the store info lookup");
  assert.ok(trackIndex < salesQueryIndex, "access tracking must run before any sales query");
  assert.ok(trackIndex < payoutQueryIndex, "access tracking must run before any payout query");

  // getStoreNameAndRate/buildStoreSalesData/buildStorePayouts are all
  // called with the SAME storeId variable resolved from the token --
  // never a literal, never a different identifier -- so isolation holds
  // for whichever store the token happens to belong to.
  assert.ok(source.includes("getStoreNameAndRate(storeId)"));
  assert.ok(source.includes("buildStoreSalesData(storeId, store.fundraiserRate, range)"));
  assert.ok(source.includes("buildStorePayouts(storeId)"));
});

run("access tracking never happens inside resolvePortalStoreId itself, for any token", () => {
  // resolvePortalStoreId() must only resolve/validate the token -- it
  // must never record access itself. (Slice 4A correction, still true
  // under Phase 4E: it previously called trackPortalAccess internally.)
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
  // be exported so the caller can invoke it once the token has
  // resolved.
  assert.ok(portalAccessSource.includes("export async function recordPortalAccess"));
  assert.ok(portalAccessSource.includes('rpc("increment_portal_token_access"'));
});

run("generatePortalLink/regeneratePortalLink work for any valid store id; revokePortalLink is never gated by the global flag", () => {
  const source = readSource("app/(internal)/stores/[storeId]/actions.ts");
  // rotateToken() (shared by generate/regenerate) validates and looks
  // up the store purely by the storeId parameter -- no per-store
  // allowlist check runs before the store-existence lookup or before a
  // token is generated.
  const rotateFnMatch = source.match(/async function rotateToken\([\s\S]*?\n\}/);
  assert.ok(rotateFnMatch, "expected to find rotateToken's full body");
  assert.equal(rotateFnMatch![0].includes("isStoreAllowedForPilot"), false);
  assert.ok(rotateFnMatch![0].includes('.eq("id", storeId)'));

  // revokePortalLink must never reference the feature-flag function --
  // revoking stays available regardless of the global shutdown state.
  const revokeFnMatch = source.match(
    /export async function revokePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(revokeFnMatch, "expected to find revokePortalLink's full body");
  assert.equal(/isStoreAllowedForPilot|isPortalGenerationEnabled/.test(revokeFnMatch![0]), false);
});

run("PortalLinkSection shows the same Customer Portal section for every store, with no per-store id ever rendered as a restriction", () => {
  const source = stripLineComments(readSource("components/PortalLinkSection.tsx"));
  assert.equal(source.includes("PORTAL_PILOT_STORE_ID"), false);
  assert.equal(/pilot store #?\d/i.test(source), false);
  // generationEnabled is the only prop gating the Generate/Regenerate
  // buttons -- storeId itself is used only to call the Server Actions,
  // never compared against an allowlist or used to decide eligibility.
  assert.ok(source.includes("disabled={isPending || !generationEnabled}"));
});

run("PortalLinkSection's Copy Active Link button is also disabled while the global flag is off (Phase 4E correction)", () => {
  const source = stripLineComments(readSource("components/PortalLinkSection.tsx"));
  assert.ok(source.includes("disabled={isPending || !generationEnabled || !canRetrieve}"));
});

run("generatePortalLink and regeneratePortalLink both refuse to run rotateToken() when the global flag is disabled", () => {
  const source = readSource("app/(internal)/stores/[storeId]/actions.ts");
  for (const fnName of ["generatePortalLink", "regeneratePortalLink"]) {
    const fnMatch = source.match(
      new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`)
    );
    assert.ok(fnMatch, `expected to find ${fnName}'s full body`);
    const body = fnMatch![0];
    const flagCheckIndex = body.indexOf("isPortalGenerationEnabled()");
    const rotateCallIndex = body.indexOf("rotateToken(storeId)");
    assert.ok(flagCheckIndex !== -1 && rotateCallIndex !== -1, `expected both checkpoints in ${fnName}`);
    assert.ok(flagCheckIndex < rotateCallIndex, `${fnName} must check the flag before calling rotateToken`);
  }
});

run("no store id anywhere in the portal source is special-cased (e.g. the former pilot store, 93)", () => {
  // Every production store id this app will ever assign is a positive
  // integer, so a literal standalone "93" (the former pilot store)
  // appearing as its own token in the generate/retrieve/revoke/data
  // paths would indicate a leftover special case. Comments are allowed
  // to mention it historically (several already do, describing the
  // removed restriction); only the executable source is checked here.
  const files = [
    "app/(internal)/stores/[storeId]/actions.ts",
    "lib/customerPortalSalesData.ts",
    "lib/portalAccess.ts",
    "lib/portalFeatureFlag.ts",
    "lib/portalFeatureFlagLogic.ts",
    "components/PortalLinkSection.tsx",
  ];
  for (const file of files) {
    const source = stripLineComments(readSource(file));
    assert.equal(
      /\b93\b/.test(source),
      false,
      `${file} must not special-case any specific store id`
    );
  }
});

run("getActivePortalLink's encrypted retrieval path has no store-specific branch -- it resolves purely from the storeId argument", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/actions.ts"));
  const fnMatch = source.match(
    /export async function getActivePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "expected to find getActivePortalLink's full body");
  const body = fnMatch![0];
  // Every conditional in this function checks either the staff session,
  // the storeId's own validity/format, or the query result -- never a
  // comparison against a specific id.
  assert.equal(/storeId\s*===\s*\d/.test(body), false);
  assert.equal(/storeId\s*==\s*\d/.test(body), false);
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

run("getActivePortalLink checks staff auth, then the global flag, before any database query, and re-checks active status and expiry, for any store", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/actions.ts"));
  const fnMatch = source.match(
    /export async function getActivePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "expected to find getActivePortalLink's full body");
  const body = fnMatch![0];

  const sessionIndex = body.indexOf("requireStaffSession()");
  const flagCheckIndex = body.indexOf("isPortalGenerationEnabled()");
  const queryIndex = body.indexOf('.from("online_store_portal_tokens")');
  assert.ok(sessionIndex !== -1 && flagCheckIndex !== -1 && queryIndex !== -1);
  assert.ok(sessionIndex < flagCheckIndex, "requireStaffSession() must run before the global-flag check");
  assert.ok(flagCheckIndex < queryIndex, "the global-flag check must run before the token lookup");
  assert.equal(body.includes("isStoreAllowedForPilot"), false);
  assert.ok(body.includes(".eq(\"online_store_id\", storeId)"));

  assert.ok(body.includes('.eq("active", true)'));
  assert.ok(body.includes("expires_at.is.null"));
  assert.ok(body.includes("expires_at.gt."));
});

run("getActivePortalLink is blocked by the global shutdown flag (Phase 4E correction), unlike revokePortalLink", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/actions.ts"));
  const retrieveFnMatch = source.match(
    /export async function getActivePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(retrieveFnMatch, "expected to find getActivePortalLink's full body");
  assert.ok(
    /if\s*\(!isPortalGenerationEnabled\(\)\)\s*\{\s*return/.test(retrieveFnMatch![0]),
    "expected an early return guarded by !isPortalGenerationEnabled()"
  );

  // Disable Link must remain the one exception that stays available
  // during a shutdown.
  const revokeFnMatch = source.match(
    /export async function revokePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(revokeFnMatch, "expected to find revokePortalLink's full body");
  assert.equal(revokeFnMatch![0].includes("isPortalGenerationEnabled"), false);
});

run("getActivePortalLink never returns the encryption key or a decryption failure's internal detail", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/actions.ts"));
  const fnMatch = source.match(
    /export async function getActivePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch);
  const body = fnMatch![0];
  assert.equal(/console\.\w+\(/.test(body), false, "must never log anything");
  // The catch block around decryption must return a fixed, generic
  // error string, never the caught error itself or any of its
  // properties.
  assert.equal(/catch\s*\([^)]*\)\s*\{[^}]*\berr\b/.test(body), false);
});

run("revokePortalLink clears encrypted_token in the same update as active = false", () => {
  const source = stripLineComments(
    readSource("app/(internal)/stores/[storeId]/actions.ts")
  );
  const fnMatch = source.match(
    /export async function revokePortalLink\([\s\S]*?\n\}/
  );
  assert.ok(fnMatch, "expected to find revokePortalLink's full body");
  const body = fnMatch![0];
  const updateCallMatch = body.match(/\.update\(\{([\s\S]*?)\}\)/);
  assert.ok(updateCallMatch, "expected a single .update({...}) call");
  assert.ok(/active:\s*false/.test(updateCallMatch![1]));
  assert.ok(/encrypted_token:\s*null/.test(updateCallMatch![1]));
});

run("rotateToken requires successful encryption before ever calling the rotation RPC (correction: no longer best-effort)", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/actions.ts"));
  const fnMatch = source.match(/async function rotateToken\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected to find rotateToken's full body");
  const body = fnMatch![0];

  assert.ok(body.includes("p_encrypted_token: encryptedToken"));

  const tryMatch = body.match(/try\s*\{([\s\S]*?)\}\s*catch[\s\S]*?\{([\s\S]*?)\}/);
  assert.ok(tryMatch, "expected a try/catch around the encryption call");
  assert.ok(tryMatch![1].includes("encryptPortalToken"));

  // The catch block must now return early with a generic error --
  // encryptedToken must never be set to null and allowed to fall
  // through to the RPC call the way the earlier (best-effort) design
  // did.
  assert.ok(/return\s*\{\s*error:/.test(tryMatch![2]), "catch block must return an error, not fall through");
  assert.equal(/encryptedToken\s*=\s*null/.test(tryMatch![2]), false);

  // The RPC call (which atomically deactivates the old token and
  // inserts the new one) must be textually AFTER the try/catch, so a
  // thrown/caught encryption failure's early return genuinely prevents
  // it from ever running -- neither deactivating an existing token nor
  // creating an unrecoverable new one.
  const tryCatchEndIndex = body.indexOf(tryMatch![0]) + tryMatch![0].length;
  const rpcCallIndex = body.indexOf('supabaseAdmin.rpc("rotate_online_store_portal_token"');
  assert.ok(rpcCallIndex !== -1 && rpcCallIndex > tryCatchEndIndex);
});

run("rotateToken's encryptedToken is always a real value by the time the RPC runs, never null", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/actions.ts"));
  const fnMatch = source.match(/async function rotateToken\([\s\S]*?\n\}/);
  assert.ok(fnMatch);
  const body = fnMatch![0];
  // The declared type excludes null -- a TypeScript-level guarantee
  // that every code path reaching the RPC call assigned a real string.
  assert.ok(/let encryptedToken:\s*string;/.test(body));
});

run("the portal token encryption key is never NEXT_PUBLIC_-prefixed and never logged anywhere in this module", () => {
  const source = stripLineComments(readSource("lib/portalTokenCrypto.ts"));
  assert.equal(source.includes("NEXT_PUBLIC_PORTAL_TOKEN_ENCRYPTION_KEY"), false);
  assert.equal(/console\.\w+\(/.test(source), false);
});

run("getPortalLinkStatus never returns the raw encrypted_token value itself, only a derived boolean", () => {
  const source = stripLineComments(readSource("lib/onlineStorePortalData.ts"));
  const returnMatch = source.match(/return \{([\s\S]*?)\};/);
  assert.ok(returnMatch, "expected to find getPortalLinkStatus's return object");
  const body = returnMatch![1];

  // encrypted_token is allowed to appear here only as the right-hand
  // side of a !== null comparison assigned to canRetrieve -- it must
  // never be forwarded as a value (bare or under any key) in its own
  // right.
  assert.ok(/canRetrieve:\s*data\.encrypted_token\s*!==\s*null/.test(body));
  assert.equal(/encrypted_token\s*,/.test(body), false, "must not be returned as a bare value");
  assert.equal(/encryptedToken\s*:/.test(body), false, "must not be returned under any key");

  // PortalLinkStatus's own type declaration must likewise expose only
  // the boolean, never a raw token/ciphertext field.
  const typeMatch = source.match(/export type PortalLinkStatus = \{([\s\S]*?)\};/);
  assert.ok(typeMatch, "expected to find the PortalLinkStatus type");
  assert.equal(/token/i.test(typeMatch![1]), false);
});

run("PortalLinkSection's masked placeholder is a fixed string -- the component never references encrypted_token or the encryption key", () => {
  const source = stripLineComments(readSource("components/PortalLinkSection.tsx"));
  assert.equal(source.includes("encrypted_token"), false);
  assert.equal(source.includes("PORTAL_TOKEN_ENCRYPTION_KEY"), false);
  // The masked row's input must be a literal string value, not an
  // expression reading from initialStatus/rawLink/storeId.
  assert.ok(source.includes('value="•••'));
});

run("the encrypted-copy migration is wrapped in BEGIN/COMMIT and drops the old 3-argument signature before creating the 4-argument replacement", () => {
  const rawSource = readSource(
    "../database/migrations/20261013_add_portal_token_encrypted_copy.sql"
  );
  const source = stripSqlComments(rawSource);

  // The entire migration -- column addition, drop, create, and the
  // grant/revoke pair -- must run as one atomic transaction.
  const beginIndex = source.search(/^\s*begin\s*;/im);
  const commitIndex = source.search(/^\s*commit\s*;/im);
  assert.ok(beginIndex !== -1 && commitIndex !== -1, "expected BEGIN; ... COMMIT;");
  const alterIndex = source.indexOf("alter table public.online_store_portal_tokens");
  assert.ok(alterIndex !== -1 && beginIndex < alterIndex && alterIndex < commitIndex);

  // The whole point of the correction: without this explicit drop,
  // CREATE OR REPLACE with a different parameter-type list creates a
  // second, ambiguous overload rather than replacing the function in
  // place.
  const dropIndex = source.indexOf(
    "drop function if exists public.rotate_online_store_portal_token(bigint, text, timestamptz)"
  );
  const createIndex = source.indexOf(
    "create or replace function public.rotate_online_store_portal_token"
  );
  assert.ok(dropIndex !== -1, "expected the old 3-argument signature to be explicitly dropped");
  assert.ok(createIndex !== -1 && dropIndex < createIndex, "the drop must run before the create");
  assert.ok(beginIndex < dropIndex && createIndex < commitIndex, "drop/create must be inside the transaction");

  // Exactly one CREATE for this function name (the 4-argument version)
  // -- not two separate CREATE statements that would themselves define
  // two overloads.
  const createMatches = source.match(
    /create or replace function public\.rotate_online_store_portal_token/g
  );
  assert.equal(createMatches?.length, 1);

  // p_encrypted_token has no default -- only p_expires_at (the trailing
  // parameter) does, which is also why p_encrypted_token is declared
  // before it: Postgres requires every defaulted parameter to come
  // after every non-defaulted one.
  const signatureMatch = source.match(
    /create or replace function public\.rotate_online_store_portal_token\(([\s\S]*?)\)\s*\n?returns/
  );
  assert.ok(signatureMatch, "expected to find the function's parameter list");
  assert.equal(/p_encrypted_token\s+text\s+default/i.test(signatureMatch![1]), false);
  assert.ok(/p_expires_at\s+timestamptz\s+default\s+null/i.test(signatureMatch![1]));

  assert.ok(source.includes("security invoker"));
  assert.ok(source.includes("set search_path = ''"));
  assert.ok(source.includes("for update"), "expected the row lock that makes rotation atomic");

  // Grant/revoke stated against the new 4-argument signature only, and
  // only to service_role -- no new anonymous or authenticated
  // permission anywhere in this file.
  const grantRevokeSignature = "(bigint, text, text, timestamptz)";
  assert.ok(
    source.includes(
      `revoke all on function public.rotate_online_store_portal_token${grantRevokeSignature} from public, anon, authenticated`
    )
  );
  assert.ok(
    source.includes(
      `grant execute on function public.rotate_online_store_portal_token${grantRevokeSignature} to service_role`
    )
  );
  assert.equal(
    /\bgrant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?public\.\w+\s+to\s+(?:anon|authenticated|public)/i.test(
      source
    ),
    false
  );
  // No new table, no new RLS policy anywhere in this migration.
  assert.equal(/\bcreate\s+table\b/i.test(source), false);
  assert.equal(source.includes("create policy"), false);

  // The deactivation UPDATE inside the function body clears
  // encrypted_token alongside active = false.
  const bodyMatch = source.match(/as \$\$([\s\S]*?)\$\$;/);
  assert.ok(bodyMatch, "expected to find the function body between as $$ ... $$;");
  const updateMatch = bodyMatch![1].match(/update[\s\S]*?set([\s\S]*?)where/i);
  assert.ok(updateMatch, "expected an UPDATE ... SET ... WHERE in the function body");
  assert.ok(/active\s*=\s*false/.test(updateMatch![1]));
  assert.ok(/encrypted_token\s*=\s*null/.test(updateMatch![1]));

  // No dynamic SQL.
  assert.equal(/\bexecute\s+format\(|\bformat\(/i.test(source), false);
});

run("the migration's rotation function rejects a null/empty p_encrypted_token before locking or deactivating anything", () => {
  const rawSource = readSource(
    "../database/migrations/20261013_add_portal_token_encrypted_copy.sql"
  );
  const source = stripSqlComments(rawSource);
  const bodyMatch = source.match(/as \$\$([\s\S]*?)\$\$;/);
  assert.ok(bodyMatch, "expected to find the function body between as $$ ... $$;");
  const body = bodyMatch![1];

  const validationIndex = body.search(
    /if\s+p_encrypted_token\s+is\s+null\s+or\s+length\(p_encrypted_token\)\s*=\s*0\s+then\s+raise\s+exception/i
  );
  assert.ok(validationIndex !== -1, "expected an explicit null/empty rejection with RAISE EXCEPTION");

  const lockIndex = body.indexOf("for update");
  const updateIndex = body.search(/update\s+public\.online_store_portal_tokens/i);
  assert.ok(lockIndex !== -1 && updateIndex !== -1);
  assert.ok(
    validationIndex < lockIndex,
    "p_encrypted_token must be validated before the store row is even locked"
  );
  assert.ok(
    validationIndex < updateIndex,
    "p_encrypted_token must be validated before the existing token is deactivated"
  );
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll portal privacy/isolation source checks passed.");
}
