import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Customer/coach portal "Discount Code" column: structural checks
// confirming the new showDiscountCode column reuses discountCodes data,
// shows a dash when no code exists (never the richer staff-only
// amount/"unavailable" states), is wired to the portal page only, and
// that the portal's explicit allowlist exposes only the code -- never
// the order-level discount amount or any customer PII.
//
// Run via `npx tsx scripts/verifySalesDataCustomerDiscountCode.ts`.

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

// --- SalesLineItemsTable: the new column ------------------------------------

// Note: renderDiscountCodeCell's state-by-state behavior (dash vs.
// "Discount Applied" vs. a real code vs. "Automatic Discount") is
// covered in depth by scripts/verifySalesDataDiscountAppliedFallback.ts.
// This file keeps only the checks still specific to the column's own
// wiring/placement and the staff-only amount never appearing in it.
run("renderDiscountCodeCell never shows the richer staff-only states or any order-level amount", () => {
  const source = readSource("components/SalesLineItemsTable.tsx");
  // Sliced between its own start and the next top-level export, rather
  // than matched up to the first "\n}" -- the function's own parameter
  // type is itself multi-line and closes with a column-0 "}" well
  // before the function's real body/closing brace.
  const startIndex = source.indexOf("function renderDiscountCodeCell(");
  const endIndex = source.indexOf("export default function SalesLineItemsTable");
  assert.ok(startIndex !== -1 && endIndex !== -1 && startIndex < endIndex, "expected to find renderDiscountCodeCell");
  const body = source.slice(startIndex, endIndex);
  assert.ok(body.includes("—"), "expected the dash character for the empty/no-evidence case");
  assert.equal(body.includes("Discount data unavailable"), false);
  assert.equal(body.includes("No discount"), false);
  assert.equal(body.includes("Code unavailable"), false);
  // No order-level amount is ever rendered by this function.
  assert.equal(body.includes("formatMoney"), false);
  assert.equal(body.includes("Order discount"), false);
});

run("showDiscountCode is a separate prop from showDiscounts, both default to false", () => {
  const source = readSource("components/SalesLineItemsTable.tsx");
  assert.ok(/showDiscountCode\s*=\s*false/.test(source));
  assert.ok(/showDiscounts\s*=\s*false/.test(source));
  assert.ok(source.includes("showDiscountCode?: boolean"));
  assert.ok(source.includes("showDiscounts?: boolean"));
});

run("the Discount Code column header and cell are both gated by showDiscountCode, placed after Total Sale Price", () => {
  const source = readSource("components/SalesLineItemsTable.tsx");
  assert.ok(source.includes('{showDiscountCode && <th className="px-4 py-3">Discount Code</th>}'));
  assert.ok(source.includes("{showDiscountCode && <td"));
  const totalSalePriceIndex = source.indexOf("Total Sale Price");
  const discountCodeHeaderIndex = source.indexOf("Discount Code</th>");
  assert.ok(totalSalePriceIndex !== -1 && discountCodeHeaderIndex !== -1 && totalSalePriceIndex < discountCodeHeaderIndex);
});

// --- Wiring: portal gets showDiscountCode, staff page does not -------------

run("the customer portal page enables showDiscountCode on SalesLineItemsTable", () => {
  const source = stripLineComments(readSource("app/portal/[token]/page.tsx"));
  const callMatch = source.match(/<SalesLineItemsTable[^/]*\/>/);
  assert.ok(callMatch, "expected to find the SalesLineItemsTable usage");
  assert.ok(callMatch![0].includes("showDiscountCode"));
});

run("the internal staff Sales page does NOT enable showDiscountCode (it already shows the richer Discount column)", () => {
  const source = stripLineComments(readSource("app/(internal)/stores/[storeId]/sales/page.tsx"));
  const callMatch = source.match(/<SalesLineItemsTable[^/]*\/>/);
  assert.ok(callMatch, "expected to find the SalesLineItemsTable usage");
  assert.equal(callMatch![0].includes("showDiscountCode"), false);
  assert.ok(callMatch![0].includes("showDiscounts"));
});

// --- Portal allowlist: code only, never the amount or PII -------------------

run("CustomerLineItem exposes discountCodes but never discountTotal (the order-level amount stays staff-only)", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const typeMatch = source.match(/export type CustomerLineItem = \{([\s\S]*?)\n\};/);
  assert.ok(typeMatch, "expected to find the CustomerLineItem type definition");
  assert.ok(/\bdiscountCodes\s*:/.test(typeMatch![1]));
  assert.equal(/\bdiscountTotal\s*:/.test(typeMatch![1]), false);
});

run("toCustomerSalesData derives discountCodes from resolveDiscountDisplayState, with a safe fallback to an empty array", () => {
  const source = stripLineComments(readSource("lib/customerPortalSalesData.ts"));
  const mapperMatch = source.match(/lineItems: data\.lineItems\.map\(\(item\) => \{([\s\S]*?)\n    \}\),/);
  assert.ok(mapperMatch, "expected to find the lineItems mapper body");
  assert.ok(mapperMatch![1].includes('discountCodes: discountState.kind === "codes" ? discountState.codes : []'));
  assert.equal(mapperMatch![1].includes("discountTotal"), false);
});

run("SalesLineItemDiscount (the type discountCodes carries) has no PII fields -- only code and applicationType", () => {
  const source = readSource("lib/onlineStoreSalesTypes.ts");
  const typeMatch = source.match(/export interface SalesLineItemDiscount \{([\s\S]*?)\n\}/);
  assert.ok(typeMatch, "expected to find the SalesLineItemDiscount type definition");
  const body = typeMatch![1];
  for (const forbidden of ["email", "phone", "address", "firstName", "lastName"]) {
    assert.equal(new RegExp(`\\b${forbidden}\\b`, "i").test(body), false, `SalesLineItemDiscount must not reference "${forbidden}"`);
  }
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll customer portal Discount Code column checks passed.");
}
