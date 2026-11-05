import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateVendorTagAlias, normalizeVendorTag, VENDOR_TAG_MAX_LENGTH } from "@/lib/vendorTagValidation";

// Multiple Shopify Vendor Tag (alias) support -- Iroquois Field Hockey is
// the first real example (online_store_id 72, existing primary tag
// "Iroquois Field Hockey", new alias "IroquoisFH"). This file covers:
// validateVendorTagAlias (a pure function, exercised directly with real
// assertions -- same pattern as discountDisplayState.ts's own test
// file), plus structural checks confirming matchOnlineStores() in
// shopifyNormalized.ts actually queries both tables and merges them
// safely, that the Server Actions module enforces staff authorization
// and validation before every write, and that removing an alias can
// never touch shopify_order_line_items (requirement: "do not
// automatically remap already-associated line items"). The database-level
// invariants themselves (global tag uniqueness, cascade delete,
// reconciliation idempotency) are covered by database/tests/
// online_store_vendor_tag_aliases_test.sql -- this file does not
// re-test those; it has no database connection to test them with.
//
// Run via `npx tsx scripts/verifyVendorTagAliases.ts`.

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

function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// --- validateVendorTagAlias: real, executable --------------------------

run("a normal, non-conflicting tag is valid and trimmed", () => {
  const result = validateVendorTagAlias("  IroquoisFH  ", { primaryTag: "Iroquois Field Hockey" });
  assert.equal(result.valid, true);
  assert.equal((result as { tag: string }).tag, "IroquoisFH");
});

run("an empty or whitespace-only tag is rejected", () => {
  assert.equal(validateVendorTagAlias("", { primaryTag: null }).valid, false);
  assert.equal(validateVendorTagAlias("   ", { primaryTag: null }).valid, false);
});

run("a tag longer than the max length is rejected", () => {
  const tooLong = "a".repeat(VENDOR_TAG_MAX_LENGTH + 1);
  const result = validateVendorTagAlias(tooLong, { primaryTag: null });
  assert.equal(result.valid, false);
});

run("a tag exactly at the max length is accepted", () => {
  const exact = "a".repeat(VENDOR_TAG_MAX_LENGTH);
  const result = validateVendorTagAlias(exact, { primaryTag: null });
  assert.equal(result.valid, true);
});

run("a tag identical to the store's own primary tag is rejected -- redundant, not a real alias", () => {
  const result = validateVendorTagAlias("Iroquois Field Hockey", {
    primaryTag: "Iroquois Field Hockey",
  });
  assert.equal(result.valid, false);
});

run("the primary-tag comparison happens AFTER trimming -- untrimmed input matching the trimmed primary tag is still rejected", () => {
  const result = validateVendorTagAlias("  Iroquois Field Hockey  ", {
    primaryTag: "Iroquois Field Hockey",
  });
  assert.equal(result.valid, false);
});

run("normalizeVendorTag only trims -- it never changes case or collapses internal whitespace", () => {
  assert.equal(normalizeVendorTag("  IroquoisFH SandS  "), "IroquoisFH SandS");
});

// --- matchOnlineStores: queries both tables, merges safely -------------

run("matchOnlineStores queries both online_stores.vendor_team_tag and online_store_vendor_tag_aliases.tag", () => {
  const source = stripLineComments(readSource("lib/shopifyNormalized.ts"));
  const fnMatch = source.match(/async function matchOnlineStores\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected to find matchOnlineStores's full body");
  const body = fnMatch![0];
  assert.ok(body.includes('.from("online_stores")'));
  assert.ok(body.includes('.from("online_store_vendor_tag_aliases")'));
  assert.ok(body.includes('.in("vendor_team_tag", uniqueTags)'));
  assert.ok(body.includes('.in("tag", uniqueTags)'));
});

run("a primary-tag match always wins over an alias match for the same tag string, never the reverse", () => {
  const source = stripLineComments(readSource("lib/shopifyNormalized.ts"));
  const fnMatch = source.match(/async function matchOnlineStores\([\s\S]*?\n\}/);
  const body = fnMatch![0];

  const primaryLoopIndex = body.indexOf("for (const store of primaryResult.data ?? [])");
  const aliasLoopIndex = body.indexOf("for (const alias of aliasResult.data ?? [])");
  assert.ok(primaryLoopIndex !== -1 && aliasLoopIndex !== -1);
  assert.ok(primaryLoopIndex < aliasLoopIndex, "primary tags must be merged into the map before aliases");
  assert.ok(
    body.includes("if (alias.tag && !map.has(alias.tag))"),
    "the alias loop must not overwrite an entry a primary tag already claimed"
  );
});

run("matchOnlineStores still never auto-creates an online_stores row for an unmatched tag", () => {
  const source = readSource("lib/shopifyNormalized.ts");
  const fnMatch = source.match(/async function matchOnlineStores\([\s\S]*?\n\}/);
  const body = fnMatch![0];
  assert.equal(body.includes(".insert("), false);
  assert.equal(body.includes(".upsert("), false);
});

// --- onlineStoreVendorTagAliases.ts: authorization, validation, scope --

run("every exported action in onlineStoreVendorTagAliases.ts calls requireStaffSession() first", () => {
  const source = stripLineComments(readSource("lib/onlineStoreVendorTagAliases.ts"));
  for (const fnName of ["getVendorTagAliases", "addVendorTagAlias", "removeVendorTagAlias"]) {
    const fnMatch = source.match(new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`));
    assert.ok(fnMatch, `expected to find ${fnName}`);
    const body = fnMatch![0];
    const sessionIndex = body.indexOf("requireStaffSession()");
    assert.ok(sessionIndex !== -1, `${fnName} must call requireStaffSession()`);
    // requireStaffSession() must run before any supabaseAdmin query in
    // the same function -- not merely present somewhere in the body.
    const firstQueryIndex = body.indexOf("supabaseAdmin");
    if (firstQueryIndex !== -1) {
      assert.ok(sessionIndex < firstQueryIndex, `${fnName} must check staff auth before any database query`);
    }
  }
});

run("addVendorTagAlias validates via validateVendorTagAlias BEFORE inserting, never after", () => {
  const source = stripLineComments(readSource("lib/onlineStoreVendorTagAliases.ts"));
  const fnMatch = source.match(/export async function addVendorTagAlias\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected to find addVendorTagAlias");
  const body = fnMatch![0];
  const validateIndex = body.indexOf("validateVendorTagAlias(");
  const insertIndex = body.indexOf('.from("online_store_vendor_tag_aliases").insert(');
  assert.ok(validateIndex !== -1 && insertIndex !== -1);
  assert.ok(validateIndex < insertIndex, "validation must run before the insert");
});

run("addVendorTagAlias records created_by from the staff session's own email, never a client-supplied value", () => {
  const source = stripLineComments(readSource("lib/onlineStoreVendorTagAliases.ts"));
  const fnMatch = source.match(/export async function addVendorTagAlias\([\s\S]*?\n\}/);
  const body = fnMatch![0];
  assert.ok(body.includes("created_by: session.email"));
});

run("removeVendorTagAlias scopes its delete by BOTH alias id and online_store_id -- it can't delete another store's alias", () => {
  const source = readSource("lib/onlineStoreVendorTagAliases.ts");
  const fnMatch = source.match(/export async function removeVendorTagAlias\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "expected to find removeVendorTagAlias");
  const body = fnMatch![0];
  assert.ok(body.includes('.eq("id", aliasId)'));
  assert.ok(body.includes('.eq("online_store_id", storeId)'));
});

run("this file never writes to shopify_order_line_items -- alias changes can only ever affect future ingestion, never already-associated rows", () => {
  // stripLineComments first: this file's own header comment explains
  // (in prose) that it never touches shopify_order_line_items, which
  // would otherwise make this check a false positive against its own
  // explanation rather than against actual code.
  const source = stripLineComments(readSource("lib/onlineStoreVendorTagAliases.ts"));
  assert.equal(source.includes("shopify_order_line_items"), false);
});

run("this file never touches sales calculations, fundraising, discounts, or customer portal data", () => {
  const source = readSource("lib/onlineStoreVendorTagAliases.ts");
  for (const forbidden of [
    "salesCalculations",
    "fundraiser",
    "discount",
    "customerPortalSalesData",
    "shopify_orders",
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `must not reference "${forbidden}"`
    );
  }
});

// --- Wiring: the Overview page renders the new section ------------------

run("the Online Store Overview page fetches and renders VendorTagAliasesSection with the store's own primary tag", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/overview/page.tsx"));
  assert.ok(source.includes("getVendorTagAliases(store.id)"));
  assert.ok(source.includes("<VendorTagAliasesSection"));
  assert.ok(source.includes("primaryTag={store.vendor_team_tag}"));
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll vendor tag alias checks passed.");
}
