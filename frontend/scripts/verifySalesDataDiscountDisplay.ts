import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDiscountDisplayState } from "@/lib/discountDisplayState";

// Production-readiness fixes for the Sales Data discount display feature:
// (1) a failed shopify_order_discounts lookup must not crash the page and
// must never be displayed as a confirmed absence of a discount; (2) a
// null/missing discountTotal must never be treated as 0. This script
// exercises resolveDiscountDisplayState's four-state decision logic
// directly (a real, executable test, not a structural stand-in -- the
// whole point of extracting it into lib/discountDisplayState.ts), plus
// structural checks confirming salesCalculations.ts's query-failure
// handling actually matches what these states assume.
//
// Run via `npx tsx scripts/verifySalesDataDiscountDisplay.ts`.

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

// --- resolveDiscountDisplayState: real, executable -----------------------

run("codes present (lookup succeeded, found applications) + known amount -> 'codes' state carries both", () => {
  const state = resolveDiscountDisplayState({
    discountTotal: 54.72,
    discountCodes: [{ code: "8PW77TL", applicationType: "discount_code" }],
  });
  assert.equal(state.kind, "codes");
  assert.deepEqual((state as any).codes, [{ code: "8PW77TL", applicationType: "discount_code" }]);
  assert.equal((state as any).total, 54.72);
});

run("multiple codes are all preserved, in order, including an automatic discount alongside a code", () => {
  const state = resolveDiscountDisplayState({
    discountTotal: 20,
    discountCodes: [
      { code: "SAVE10", applicationType: "discount_code" },
      { code: null, applicationType: "automatic" },
    ],
  });
  assert.equal(state.kind, "codes");
  assert.equal((state as any).codes.length, 2);
  assert.equal((state as any).codes[0].applicationType, "discount_code");
  assert.equal((state as any).codes[1].applicationType, "automatic");
});

run("codes present but amount unknown -> still 'codes', with total null (never fabricated as 0)", () => {
  const state = resolveDiscountDisplayState({
    discountTotal: null,
    discountCodes: [{ code: "SAVE10", applicationType: "discount_code" }],
  });
  assert.equal(state.kind, "codes");
  assert.equal((state as any).total, null);
});

run("confirmed zero: lookup succeeded (empty array, not undefined) AND amount is exactly 0 -> 'no-discount'", () => {
  const state = resolveDiscountDisplayState({ discountTotal: 0, discountCodes: [] });
  assert.equal(state.kind, "no-discount");
});

run("amount 0 but the code lookup FAILED (discountCodes undefined) -> NOT 'no-discount' -- 'unavailable' instead", () => {
  const state = resolveDiscountDisplayState({ discountTotal: 0, discountCodes: undefined });
  assert.equal(state.kind, "unavailable");
  assert.notEqual(state.kind, "no-discount");
});

run("positive known amount, lookup succeeded but found nothing (empty array) -> 'code-unavailable'", () => {
  const state = resolveDiscountDisplayState({ discountTotal: 54.72, discountCodes: [] });
  assert.equal(state.kind, "code-unavailable");
  assert.equal((state as any).total, 54.72);
});

run("positive known amount, lookup FAILED (discountCodes undefined) -> still 'code-unavailable', never 'no-discount'", () => {
  const state = resolveDiscountDisplayState({ discountTotal: 54.72, discountCodes: undefined });
  assert.equal(state.kind, "code-unavailable");
  assert.notEqual(state.kind, "no-discount");
});

run("amount null (genuinely unknown) and codes undefined (lookup failed) -> 'unavailable'", () => {
  const state = resolveDiscountDisplayState({ discountTotal: null, discountCodes: undefined });
  assert.equal(state.kind, "unavailable");
});

run("amount null and codes confirmed empty (lookup succeeded, found nothing) -> still 'unavailable', not 'no-discount' -- amount itself is not confirmed", () => {
  const state = resolveDiscountDisplayState({ discountTotal: null, discountCodes: [] });
  assert.equal(state.kind, "unavailable");
});

run("amount missing entirely (undefined, field never set) behaves the same as null", () => {
  const state = resolveDiscountDisplayState({ discountCodes: undefined });
  assert.equal(state.kind, "unavailable");
});

run("negative amount (defensive, should not occur in practice) never resolves to 'no-discount' or 'code-unavailable'", () => {
  const state = resolveDiscountDisplayState({ discountTotal: -5, discountCodes: [] });
  assert.equal(state.kind, "unavailable");
});

// --- salesCalculations.ts structural checks: query-failure handling ------

run("the shopify_order_discounts lookup is wrapped in try/catch, not a bare throw -- a failure must not crash the page", () => {
  const source = readSource("lib/salesCalculations.ts");
  const tryIndex = source.indexOf("try {");
  const fromIndex = source.indexOf('.from("shopify_order_discounts")');
  const catchIndex = source.indexOf("} catch (err) {");
  assert.ok(tryIndex !== -1 && fromIndex !== -1 && catchIndex !== -1, "expected a try/catch around the discount query");
  assert.ok(tryIndex < fromIndex, "the discount query must be inside the try block");
  assert.ok(fromIndex < catchIndex, "the catch block must come after the discount query");
});

run("a failed discount lookup is logged via console.error, not swallowed silently", () => {
  const source = readSource("lib/salesCalculations.ts");
  const catchMatch = source.match(/\}\s*catch\s*\(err\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(catchMatch, "expected to find the discount-lookup catch block");
  assert.ok(catchMatch![1].includes("console.error("), "expected the catch block to log the error");
});

run("discountLookupSucceeded is set false on failure, and gates discountCodes to undefined (never [])", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  assert.ok(source.includes("discountLookupSucceeded = false"));
  // The lineItems mapping must branch on discountLookupSucceeded, with
  // the failure branch resolving to `undefined`, not an empty array --
  // an empty array would be indistinguishable from a successful lookup
  // that confirmed zero discounts.
  const mapMatch = source.match(/discountCodes:\s*discountLookupSucceeded([\s\S]*?),/);
  assert.ok(mapMatch, "expected to find the discountCodes assignment gated on discountLookupSucceeded");
  assert.ok(mapMatch![1].includes(": undefined"), "expected the failure branch to resolve to undefined");
});

run("discountTotal is read from the main order query, unconditional on the discount-lookup try/catch", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  // discountTotal's assignment must reference row.order.total_discounts
  // directly (the already-fetched, always-available main-query field),
  // and must not be textually inside the try/catch block that can fail.
  const tryStart = source.indexOf("try {");
  const catchEnd = source.indexOf("}\n  }", source.indexOf("} catch (err) {"));
  const discountTotalIndex = source.indexOf("discountTotal: row.order?.total_discounts");
  assert.ok(discountTotalIndex !== -1, "expected discountTotal's assignment from row.order.total_discounts");
  assert.ok(
    discountTotalIndex < tryStart || discountTotalIndex > catchEnd,
    "discountTotal's assignment must be outside the discount-lookup try/catch block"
  );
});

run("the totals/best-sellers computation itself still never reads any discount table or column", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  const totalsStart = source.indexOf("let totalSales = 0;");
  const totalsEnd = source.indexOf("const scopedOrderIds =");
  assert.ok(totalsStart !== -1 && totalsEnd !== -1 && totalsStart < totalsEnd);
  const totalsBlock = source.slice(totalsStart, totalsEnd);
  assert.equal(totalsBlock.toLowerCase().includes("discount"), false);
});

run("SalesLineItemsTable renders via resolveDiscountDisplayState's four states, not inline ad hoc conditions", () => {
  const source = readSource("components/SalesLineItemsTable.tsx");
  assert.ok(source.includes('import { resolveDiscountDisplayState } from "@/lib/discountDisplayState"'));
  for (const kind of ["codes", "no-discount", "code-unavailable", "unavailable"]) {
    assert.ok(source.includes(`case "${kind}"`), `expected a case for "${kind}"`);
  }
});

run("the customer portal still never references the discount display fields or helper", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  assert.equal(source.includes("discountTotal"), false);
  assert.equal(source.includes("discountCodes"), false);
  assert.equal(source.includes("discountDisplayState"), false);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Sales Data discount display checks passed.");
}
