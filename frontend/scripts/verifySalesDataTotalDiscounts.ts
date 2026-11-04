import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeTotalDiscounts, type OrderDiscountInput } from "@/lib/storeDiscountTotal";

// Sales Data "Total Discounts" summary card: exercises
// computeTotalDiscounts()'s dedup/multi-store-exclusion logic directly
// (real, executable tests), plus structural checks confirming
// salesCalculations.ts wires it up safely (reuses the already date-
// filtered/cancelled-excluded order id set, never throws, never leaks
// a per-order breakdown to the customer portal).
//
// Run via `npx tsx scripts/verifySalesDataTotalDiscounts.ts`.

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

// --- computeTotalDiscounts: real, executable ------------------------------

run("one order with multiple line items is counted once -- the caller supplies one entry per order, never one per line item", () => {
  // computeTotalDiscounts itself takes a list already deduplicated to one
  // entry per order (that's salesCalculations.ts's job, checked
  // structurally below) -- this test confirms a single-order input
  // contributes its discount exactly once, not multiplied by any
  // line-item count.
  const orders: OrderDiscountInput[] = [{ orderId: 1, totalDiscounts: 25, storeIds: [10] }];
  assert.equal(computeTotalDiscounts(orders), 25);
});

run("multiple distinct orders with discounts sum correctly", () => {
  const orders: OrderDiscountInput[] = [
    { orderId: 1, totalDiscounts: 10, storeIds: [10] },
    { orderId: 2, totalDiscounts: 15.5, storeIds: [10] },
    { orderId: 3, totalDiscounts: 60, storeIds: [10] },
  ];
  assert.equal(computeTotalDiscounts(orders), 85.5);
});

run("orders without a discount contribute 0, not null and not skipped", () => {
  const orders: OrderDiscountInput[] = [
    { orderId: 1, totalDiscounts: 0, storeIds: [10] },
    { orderId: 2, totalDiscounts: 20, storeIds: [10] },
  ];
  assert.equal(computeTotalDiscounts(orders), 20);
});

run("an order whose total_discounts is null (genuinely unknown) contributes nothing, rather than crashing or coercing to 0 elsewhere", () => {
  const orders: OrderDiscountInput[] = [
    { orderId: 1, totalDiscounts: null, storeIds: [10] },
    { orderId: 2, totalDiscounts: 20, storeIds: [10] },
  ];
  assert.equal(computeTotalDiscounts(orders), 20);
});

run("an order touching exactly one store (storeIds.length === 1) is included", () => {
  const orders: OrderDiscountInput[] = [{ orderId: 1, totalDiscounts: 40, storeIds: [10] }];
  assert.equal(computeTotalDiscounts(orders), 40);
});

run("an order touching MULTIPLE stores is excluded entirely from the total -- never attributed to any one of them", () => {
  const orders: OrderDiscountInput[] = [
    { orderId: 1, totalDiscounts: 40, storeIds: [10, 20] },
    { orderId: 2, totalDiscounts: 5, storeIds: [10] },
  ];
  // Only order 2 (single-store) counts -- order 1's $40 appears in
  // NEITHER store 10's nor store 20's total, confirmed by calling this
  // same input shape twice, framed from each store's perspective.
  assert.equal(computeTotalDiscounts(orders), 5);

  const fromStore20Perspective: OrderDiscountInput[] = [
    { orderId: 1, totalDiscounts: 40, storeIds: [10, 20] },
  ];
  assert.equal(computeTotalDiscounts(fromStore20Perspective), 0);
});

run("an order resolving to zero stores (defensive -- should not occur in practice) is excluded, not treated as single-store", () => {
  const orders: OrderDiscountInput[] = [{ orderId: 1, totalDiscounts: 40, storeIds: [] }];
  assert.equal(computeTotalDiscounts(orders), 0);
});

run("an empty order list returns a definite 0, not null", () => {
  assert.equal(computeTotalDiscounts([]), 0);
});

// --- salesCalculations.ts structural checks -------------------------------

run("the membership (multi-store detection) query is NOT filtered by online_store_id -- that defeats its entire purpose", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  const membershipSelectIndex = source.indexOf('.select("order_id, online_store_id")');
  assert.ok(membershipSelectIndex !== -1, "expected the membership select");
  // The next ~200 chars after this select must not apply an
  // online_store_id filter before the query actually runs (await).
  const nearby = source.slice(membershipSelectIndex, membershipSelectIndex + 300);
  const awaitBoundary = nearby.indexOf("await");
  const beforeAwait = awaitBoundary === -1 ? nearby : nearby.slice(0, awaitBoundary);
  assert.equal(beforeAwait.includes('.eq("online_store_id"'), false);
});

run("the membership query reuses the already date-filtered/cancelled-excluded scopedOrderIds, never a fresh unfiltered order list", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  assert.ok(source.includes('.in("order_id", scopedOrderIds)'));
  // Two call sites must reuse scopedOrderIds this way: the discount-codes
  // lookup (pre-existing) and the new membership lookup -- confirmed by
  // counting occurrences rather than assuming there's exactly one.
  const occurrences = source.match(/\.in\("order_id", scopedOrderIds\)/g) ?? [];
  assert.ok(occurrences.length >= 2, "expected both the discount-codes and membership queries to reuse scopedOrderIds");
});

run("the Total Discounts lookup never throws out of buildStoreSalesData -- wrapped in try/catch, falls back to null on failure", () => {
  const source = readSource("lib/salesCalculations.ts");
  const blockMatch = source.match(/let totalDiscounts: number \| null = null;[\s\S]*?\n  \}\n\n  const lineItems/);
  assert.ok(blockMatch, "expected to find the Total Discounts computation block");
  const block = blockMatch![0];
  assert.ok(block.includes("try {"));
  assert.ok(block.includes("} catch (err) {"));
  assert.ok(block.includes("console.error("));
  assert.ok(block.includes("totalDiscounts = null;"));
});

run("orderDiscountInputs is built one entry per scopedOrderId (via .map), never one per line item", () => {
  const source = readSource("lib/salesCalculations.ts");
  assert.ok(source.includes("scopedOrderIds.map((orderId) => ({"));
});

run("totalDiscounts is attached to the returned summary object", () => {
  const source = readSource("lib/salesCalculations.ts");
  assert.ok(/fundraiserEarned: totalSales \* fundraiserRate,\s*\n\s*lifetimeFundraiserEarned: lifetimeTotalSales \* fundraiserRate,\s*\n\s*totalDiscounts,/.test(source));
});

run("the existing totals/best-sellers computation itself still never reads any discount table or column", () => {
  const source = stripLineComments(readSource("lib/salesCalculations.ts"));
  const totalsStart = source.indexOf("let totalSales = 0;");
  const totalsEnd = source.indexOf("const scopedOrderIds =");
  assert.ok(totalsStart !== -1 && totalsEnd !== -1 && totalsStart < totalsEnd);
  const totalsBlock = source.slice(totalsStart, totalsEnd);
  assert.equal(totalsBlock.toLowerCase().includes("discount"), false);
});

// --- Customer portal privacy -----------------------------------------------

run("CustomerSalesSummary exposes only the aggregate totalDiscounts -- no per-order or per-code breakdown field", () => {
  const source = readSource("lib/customerPortalSalesData.ts");
  const typeBlockMatch = source.match(/export type CustomerSalesSummary = \{([\s\S]*?)\n\};/);
  assert.ok(typeBlockMatch, "expected to find the CustomerSalesSummary type definition");
  assert.ok(/\btotalDiscounts\s*:/.test(typeBlockMatch![1]));
  assert.equal(/\bdiscountCodes\s*:/.test(typeBlockMatch![1]), false);
  assert.equal(/\bdiscountTotal\s*:/.test(typeBlockMatch![1]), false);

  // CustomerLineItem (the per-row type) must still never carry a
  // per-order discount breakdown either -- unaffected by this feature.
  const lineItemMatch = source.match(/export type CustomerLineItem = \{([\s\S]*?)\n\};/);
  assert.ok(lineItemMatch, "expected to find the CustomerLineItem type definition");
  assert.equal(/\bdiscountTotal\s*:/.test(lineItemMatch![1]), false);
  assert.equal(/\bdiscountCodes\s*:/.test(lineItemMatch![1]), false);
});

run("toCustomerSalesData explicitly maps totalDiscounts into the summary -- a deliberate inclusion", () => {
  const source = stripLineComments(readSource("lib/customerPortalSalesData.ts"));
  const mapperMatch = source.match(/function toCustomerSalesData\(data: StoreSalesData\): CustomerSalesData \{([\s\S]*?)\n\}/);
  assert.ok(mapperMatch, "expected to find toCustomerSalesData's body");
  assert.ok(mapperMatch![1].includes("totalDiscounts: data.summary.totalDiscounts"));
});

run("SalesSummaryCards (shared by staff and the customer portal) renders the Total Discounts card without a staff-only gate", () => {
  const source = readSource("components/SalesSummaryCards.tsx");
  assert.ok(source.includes("Total Discounts"));
  // Unlike showDiscounts on SalesLineItemsTable, there is no boolean prop
  // gating this card -- it must always render for both callers.
  assert.equal(source.includes("showDiscounts"), false);
  assert.equal(source.includes("showTotalDiscounts"), false);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Total Discounts summary card checks passed.");
}
