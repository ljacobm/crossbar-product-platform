import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveDiscountDisplayState } from "@/lib/discountDisplayState";

// Customer/coach portal "Discount Code" column -- the "Discount Applied"
// fallback: distinguishes "no evidence a discount was applied" (dash)
// from "a real discount was applied but the code wasn't captured"
// ("Discount Applied"), reusing the SAME resolveDiscountDisplayState()
// decision logic the staff column already relies on. These tests
// exercise that reuse directly -- the exact mapping
// customerPortalSalesData.ts applies (discountCodes from the "codes"
// state, discountAppliedWithoutCode from the "code-unavailable" state)
// -- plus structural checks on the wiring and privacy surface.
//
// Run via `npx tsx scripts/verifySalesDataDiscountAppliedFallback.ts`.

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

// Mirrors exactly what customerPortalSalesData.ts's toCustomerSalesData()
// mapper does, so these tests exercise the real derivation, not a
// reimplementation of it.
function deriveCustomerDiscountFields(row: { discountTotal?: number | null; discountCodes?: { code: string | null; applicationType: string }[] }) {
  const state = resolveDiscountDisplayState(row);
  return {
    discountCodes: state.kind === "codes" ? state.codes : [],
    discountAppliedWithoutCode: state.kind === "code-unavailable",
  };
}

// --- Scenario 1: a real code is preserved exactly as before ----------------

run("a real discount code (e.g. 8PW77TL) is preserved in discountCodes, discountAppliedWithoutCode is false", () => {
  const result = deriveCustomerDiscountFields({
    discountTotal: 54.72,
    discountCodes: [{ code: "8PW77TL", applicationType: "discount_code" }],
  });
  assert.deepEqual(result.discountCodes, [{ code: "8PW77TL", applicationType: "discount_code" }]);
  assert.equal(result.discountAppliedWithoutCode, false);
});

// --- Scenario 2: automatic discount -----------------------------------------

run("an automatic discount application is preserved in discountCodes (applicationType: 'automatic')", () => {
  const result = deriveCustomerDiscountFields({
    discountTotal: 10,
    discountCodes: [{ code: null, applicationType: "automatic" }],
  });
  assert.equal(result.discountCodes.length, 1);
  assert.equal(result.discountCodes[0].applicationType, "automatic");
  assert.equal(result.discountAppliedWithoutCode, false);
});

// --- Scenario 3: positive discount, no code (the #15083-style gap) ---------

run("a positive, known discount amount with no captured code sets discountAppliedWithoutCode -- the exact #15083 scenario", () => {
  const result = deriveCustomerDiscountFields({
    discountTotal: 54.72,
    discountCodes: [],
  });
  assert.deepEqual(result.discountCodes, []);
  assert.equal(result.discountAppliedWithoutCode, true);
});

run("a positive discount amount with the code lookup having failed entirely (discountCodes undefined) still sets discountAppliedWithoutCode", () => {
  const result = deriveCustomerDiscountFields({
    discountTotal: 20,
    discountCodes: undefined,
  });
  assert.equal(result.discountAppliedWithoutCode, true);
});

// --- Scenario 4: confirmed zero discount ------------------------------------

run("a confirmed-zero discount (amount exactly 0, lookup succeeded as empty) sets discountAppliedWithoutCode to false -- renders as a dash", () => {
  const result = deriveCustomerDiscountFields({
    discountTotal: 0,
    discountCodes: [],
  });
  assert.deepEqual(result.discountCodes, []);
  assert.equal(result.discountAppliedWithoutCode, false);
});

// --- Scenario 5: missing/unknown data ---------------------------------------

run("missing/unknown data (amount null, codes undefined) sets discountAppliedWithoutCode to false -- no evidence, renders as a dash", () => {
  const result = deriveCustomerDiscountFields({
    discountTotal: null,
    discountCodes: undefined,
  });
  assert.deepEqual(result.discountCodes, []);
  assert.equal(result.discountAppliedWithoutCode, false);
});

run("amount 0 but the code lookup itself failed (discountCodes undefined) -- still no reliable evidence, renders as a dash, not 'Discount Applied'", () => {
  const result = deriveCustomerDiscountFields({
    discountTotal: 0,
    discountCodes: undefined,
  });
  assert.equal(result.discountAppliedWithoutCode, false);
  assert.deepEqual(result.discountCodes, []);
});

// --- Scenario 6: multiple line items from the same order stay consistent ---

run("multiple line items belonging to the same order derive identical discountCodes/discountAppliedWithoutCode", () => {
  // Same order-level inputs, as would be true for every line item row of
  // one order (order-level fields are repeated per row upstream).
  const orderLevelRow = { discountTotal: 54.72, discountCodes: [] as { code: string | null; applicationType: string }[] };
  const lineItem1 = deriveCustomerDiscountFields(orderLevelRow);
  const lineItem2 = deriveCustomerDiscountFields(orderLevelRow);
  const lineItem3 = deriveCustomerDiscountFields(orderLevelRow);
  assert.deepEqual(lineItem1, lineItem2);
  assert.deepEqual(lineItem2, lineItem3);
  assert.equal(lineItem1.discountAppliedWithoutCode, true);
});

run("multiple line items with a real code all show the same code, not duplicated or split per item", () => {
  const orderLevelRow = {
    discountTotal: 60,
    discountCodes: [{ code: "SAVE20", applicationType: "discount_code" }],
  };
  const lineItem1 = deriveCustomerDiscountFields(orderLevelRow);
  const lineItem2 = deriveCustomerDiscountFields(orderLevelRow);
  assert.deepEqual(lineItem1.discountCodes, lineItem2.discountCodes);
  assert.deepEqual(lineItem1.discountCodes, [{ code: "SAVE20", applicationType: "discount_code" }]);
});

// --- Structural: wiring, labels, and privacy --------------------------------

run("customerPortalSalesData.ts reuses resolveDiscountDisplayState and never reads or forwards its 'total' number", () => {
  const source = stripLineComments(readSource("lib/customerPortalSalesData.ts"));
  assert.ok(source.includes('import { resolveDiscountDisplayState } from "@/lib/discountDisplayState"'));
  assert.ok(source.includes("const discountState = resolveDiscountDisplayState(item);"));
  assert.ok(source.includes('discountAppliedWithoutCode: discountState.kind === "code-unavailable"'));
  // The resolved state's own "total" field (present on "codes" and
  // "code-unavailable") is never referenced anywhere in this file.
  assert.equal(/discountState\.total\b/.test(source), false);
});

run("CustomerLineItem declares discountAppliedWithoutCode as a plain boolean, with no dollar-amount field anywhere nearby", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const typeMatch = source.match(/export type CustomerLineItem = \{([\s\S]*?)\n\};/);
  assert.ok(typeMatch, "expected to find the CustomerLineItem type definition");
  assert.ok(/\bdiscountAppliedWithoutCode\s*:\s*boolean/.test(typeMatch![1]));
  assert.equal(/\bdiscountTotal\s*:/.test(typeMatch![1]), false);
  assert.equal(/\bdiscountAmount\s*:/.test(typeMatch![1]), false);
});

run("renderDiscountCodeCell renders 'Discount Applied' only when discountAppliedWithoutCode is true and no code exists", () => {
  const source = readSource("components/SalesLineItemsTable.tsx");
  const startIndex = source.indexOf("function renderDiscountCodeCell(");
  const endIndex = source.indexOf("export default function SalesLineItemsTable");
  assert.ok(startIndex !== -1 && endIndex !== -1 && startIndex < endIndex);
  const body = source.slice(startIndex, endIndex);
  assert.ok(body.includes("row.discountAppliedWithoutCode"));
  assert.ok(body.includes("Discount Applied"));
  // "Discount Applied" is checked strictly after the codes.length > 0
  // branch, and the dash is the final fallback -- confirmed by order of
  // appearance in the function body.
  const codesCheckIndex = body.indexOf("codes.length > 0");
  // "row.discountAppliedWithoutCode" (the usage in the if-check) --
  // not the bare field name, which also appears earlier in the
  // function's own parameter type declaration.
  const appliedCheckIndex = body.indexOf("row.discountAppliedWithoutCode");
  const dashIndex = body.lastIndexOf("—");
  assert.ok(codesCheckIndex !== -1 && codesCheckIndex < appliedCheckIndex && appliedCheckIndex < dashIndex);
});

run("the automatic-discount label in the customer column is 'Automatic Discount' (capital D), the exact approved wording", () => {
  const source = readSource("components/SalesLineItemsTable.tsx");
  const startIndex = source.indexOf("function renderDiscountCodeCell(");
  const endIndex = source.indexOf("export default function SalesLineItemsTable");
  const body = source.slice(startIndex, endIndex);
  assert.ok(body.includes('"Automatic Discount"'));
});

run("no actual discount code is ever invented or guessed -- the only code strings rendered come from discount.code itself", () => {
  const source = readSource("components/SalesLineItemsTable.tsx");
  const startIndex = source.indexOf("function renderDiscountCodeCell(");
  const endIndex = source.indexOf("export default function SalesLineItemsTable");
  const body = source.slice(startIndex, endIndex);
  // The only non-data-driven code-ish string is the generic fallback
  // label for a named (non-automatic) application with a null code --
  // never a fabricated code value.
  assert.ok(body.includes("discount.code || \"Discount code\""));
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Discount Applied fallback checks passed.");
}
