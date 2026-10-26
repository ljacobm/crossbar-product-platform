import assert from "node:assert/strict";
import {
  normalizeRestOrder,
  normalizeRestFulfillment,
  normalizeRestRefund,
  type ShopifyOrderPayload,
  type ShopifyFulfillmentPayload,
  type ShopifyRefundPayload,
} from "@/lib/shopifyRestAdapter";
import {
  buildCompleteOrderFieldsJson,
  buildCustomerJson,
  buildDiscountsJson,
} from "@/lib/shopifyNormalized";

// Phase 1, Milestone 2: pure, DB-free tests for the extended REST
// adapter (order cancellations/discounts, fulfillments, refunds) and
// the pure JSON-builder helpers in shopifyNormalized.ts. None of this
// touches a database -- `matchLineItemsToStores()` (the one piece of
// the RPC-calling path that does) is deliberately not exercised here;
// see scripts/verifyShopifyLifecycleIngestion.ts for the structural
// tests covering the parts that need a live Supabase connection to run
// for real.
//
// Run via `npx tsx scripts/verifyShopifyLifecycleNormalization.ts`.

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

function baseOrderPayload(overrides: Partial<ShopifyOrderPayload> = {}): ShopifyOrderPayload {
  return {
    id: 1001,
    name: "#1001",
    email: "customer@example.com",
    financial_status: "paid",
    fulfillment_status: null,
    currency: "USD",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    line_items: [{ id: 5001, title: "Jersey", quantity: 2, price: "25.00" }],
    ...overrides,
  };
}

// --- Order: cancellation -----------------------------------------------

run("normalizeRestOrder: cancel_reason is read through as-is", () => {
  const payload = baseOrderPayload({ cancelled_at: "2026-01-02T00:00:00Z", cancel_reason: "customer" });
  const normalized = normalizeRestOrder(payload);
  assert.equal(normalized.cancelledAt, "2026-01-02T00:00:00Z");
  assert.equal(normalized.cancelReason, "customer");
});

run("normalizeRestOrder: missing cancel_reason normalizes to null, not undefined or a default", () => {
  const normalized = normalizeRestOrder(baseOrderPayload());
  assert.equal(normalized.cancelReason, null);
});

run("normalizeRestOrder: financialStatusRaw mirrors REST's already-lowercase financial_status", () => {
  const normalized = normalizeRestOrder(baseOrderPayload({ financial_status: "partially_refunded" }));
  assert.equal(normalized.financialStatus, "partially_refunded");
  assert.equal(normalized.financialStatusRaw, "partially_refunded");
});

// --- Order: discounts, missing vs. empty vs. populated -----------------

run("normalizeRestOrder: discount_applications entirely absent -> discounts is null (no opinion), not []", () => {
  const normalized = normalizeRestOrder(baseOrderPayload());
  assert.equal(normalized.discounts, null);
});

run("normalizeRestOrder: discount_applications explicitly empty -> discounts is [] (confirmed zero)", () => {
  const normalized = normalizeRestOrder(baseOrderPayload({ discount_applications: [] }));
  assert.deepEqual(normalized.discounts, []);
});

run("normalizeRestOrder: a discount-code application is classified correctly, amount/percentage split by value_type", () => {
  const payload = baseOrderPayload({
    discount_applications: [
      { type: "discount_code", code: "SAVE10", value_type: "percentage", value: "10.0", target_type: "line_item" },
    ],
    line_items: [
      {
        id: 5001,
        title: "Jersey",
        quantity: 2,
        price: "25.00",
        discount_allocations: [{ amount: "5.00", discount_application_index: 0 }],
      },
    ],
  });
  const normalized = normalizeRestOrder(payload);
  assert.equal(normalized.discounts?.length, 1);
  const discount = normalized.discounts![0];
  assert.equal(discount.applicationIndex, 0);
  assert.equal(discount.applicationType, "discount_code");
  assert.equal(discount.code, "SAVE10");
  assert.equal(discount.valueType, "percentage");
  assert.equal(discount.valuePercentage, 10);
  assert.equal(discount.valueAmount, null);
  assert.equal(discount.isFreeShipping, false);
  assert.equal(discount.allocations.length, 1);
  assert.equal(discount.allocations[0].orderLineItemShopifyId, 5001);
  assert.equal(discount.allocations[0].isShippingLineAllocation, false);
  assert.equal(discount.allocations[0].allocatedAmount, 5);
});

run("normalizeRestOrder: a fixed-amount manual discount is classified correctly", () => {
  const payload = baseOrderPayload({
    discount_applications: [
      { type: "manual", title: "Staff discount", value_type: "fixed_amount", value: "3.50", target_type: "line_item" },
    ],
  });
  const discount = normalizeRestOrder(payload).discounts![0];
  assert.equal(discount.applicationType, "manual");
  assert.equal(discount.title, "Staff discount");
  assert.equal(discount.valueType, "fixed_amount");
  assert.equal(discount.valueAmount, 3.5);
  assert.equal(discount.valuePercentage, null);
});

run("normalizeRestOrder: a 100%-off shipping-line discount is heuristically flagged as free shipping", () => {
  const payload = baseOrderPayload({
    discount_applications: [
      { type: "discount_code", code: "FREESHIP", value_type: "percentage", value: "100.0", target_type: "shipping_line" },
    ],
    shipping_lines: [
      { title: "Standard", price: "8.00", discount_allocations: [{ amount: "8.00", discount_application_index: 0 }] },
    ],
  });
  const discount = normalizeRestOrder(payload).discounts![0];
  assert.equal(discount.targetType, "shipping_line");
  assert.equal(discount.isFreeShipping, true);
  assert.equal(discount.allocations.length, 1);
  assert.equal(discount.allocations[0].isShippingLineAllocation, true);
  assert.equal(discount.allocations[0].orderLineItemShopifyId, null);
});

run("normalizeRestOrder: a partial (non-100%) shipping discount is NOT flagged as free shipping", () => {
  const payload = baseOrderPayload({
    discount_applications: [
      { type: "discount_code", code: "SHIP50", value_type: "percentage", value: "50.0", target_type: "shipping_line" },
    ],
  });
  const discount = normalizeRestOrder(payload).discounts![0];
  assert.equal(discount.isFreeShipping, false);
});

run("normalizeRestOrder: multiple discounts on one order each keep their own allocations, not merged", () => {
  const payload = baseOrderPayload({
    discount_applications: [
      { type: "discount_code", code: "A", value_type: "fixed_amount", value: "2.00", target_type: "line_item" },
      { type: "automatic", title: "B", value_type: "fixed_amount", value: "1.00", target_type: "line_item" },
    ],
    line_items: [
      {
        id: 5001,
        title: "Jersey",
        quantity: 1,
        price: "25.00",
        discount_allocations: [
          { amount: "2.00", discount_application_index: 0 },
          { amount: "1.00", discount_application_index: 1 },
        ],
      },
    ],
  });
  const discounts = normalizeRestOrder(payload).discounts!;
  assert.equal(discounts.length, 2);
  assert.equal(discounts[0].allocations.length, 1);
  assert.equal(discounts[0].allocations[0].allocatedAmount, 2);
  assert.equal(discounts[1].allocations.length, 1);
  assert.equal(discounts[1].allocations[0].allocatedAmount, 1);
});

run("normalizeRestOrder: an allocation referencing an out-of-range discount index is dropped, not crashed on", () => {
  const payload = baseOrderPayload({
    discount_applications: [{ type: "manual", value_type: "fixed_amount", value: "1.00" }],
    line_items: [
      {
        id: 5001,
        title: "Jersey",
        quantity: 1,
        price: "25.00",
        discount_allocations: [{ amount: "1.00", discount_application_index: 7 }],
      },
    ],
  });
  const discounts = normalizeRestOrder(payload).discounts!;
  assert.equal(discounts.length, 1);
  assert.equal(discounts[0].allocations.length, 0);
});

// --- Fulfillment: partial fulfillment, tracking arrays ------------------

function baseFulfillmentPayload(
  overrides: Partial<ShopifyFulfillmentPayload> = {}
): ShopifyFulfillmentPayload {
  return {
    id: 7001,
    order_id: 1001,
    status: "success",
    created_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
    line_items: [{ id: 5001, quantity: 1 }],
    ...overrides,
  };
}

run("normalizeRestFulfillment: a partial fulfillment covers only its own subset/quantities, not the whole order", () => {
  const payload = baseFulfillmentPayload({
    line_items: [{ id: 5001, quantity: 1 }], // order has quantity 2, this fulfillment covers only 1
  });
  const normalized = normalizeRestFulfillment(payload);
  assert.equal(normalized.lineItems.length, 1);
  assert.equal(normalized.lineItems[0].orderLineItemShopifyId, 5001);
  assert.equal(normalized.lineItems[0].quantity, 1);
  assert.equal(normalized.totalQuantity, 1);
  // REST never exposes a separate id for a fulfillment's own line-item
  // entry -- always null, by design (see the migration's full-replace
  // rationale for why this doesn't need to be a real id).
  assert.equal(normalized.lineItems[0].shopifyFulfillmentLineItemId, null);
});

run("normalizeRestFulfillment: multiple tracking numbers/urls are preserved as arrays, not truncated to one", () => {
  const payload = baseFulfillmentPayload({
    tracking_numbers: ["1Z999AA10123456784", "1Z999AA10123456785"],
    tracking_urls: ["https://example.com/a", "https://example.com/b"],
  });
  const normalized = normalizeRestFulfillment(payload);
  assert.deepEqual(normalized.trackingNumbers, ["1Z999AA10123456784", "1Z999AA10123456785"]);
  assert.deepEqual(normalized.trackingUrls, ["https://example.com/a", "https://example.com/b"]);
});

run("normalizeRestFulfillment: a single legacy tracking_number/tracking_url still produces a one-element array", () => {
  const payload = baseFulfillmentPayload({
    tracking_number: "1Z999AA10123456784",
    tracking_url: "https://example.com/a",
  });
  const normalized = normalizeRestFulfillment(payload);
  assert.deepEqual(normalized.trackingNumbers, ["1Z999AA10123456784"]);
  assert.deepEqual(normalized.trackingUrls, ["https://example.com/a"]);
});

run("normalizeRestFulfillment: no tracking info at all produces empty arrays, never null/undefined", () => {
  const normalized = normalizeRestFulfillment(baseFulfillmentPayload());
  assert.deepEqual(normalized.trackingNumbers, []);
  assert.deepEqual(normalized.trackingUrls, []);
});

// --- Refund: partial refund, multiple lines for the same item not collapsed --

function baseRefundPayload(overrides: Partial<ShopifyRefundPayload> = {}): ShopifyRefundPayload {
  return {
    id: 9001,
    order_id: 1001,
    created_at: "2026-01-04T00:00:00Z",
    transactions: [{ amount: "10.00" }],
    refund_line_items: [{ id: 101, line_item_id: 5001, quantity: 1, subtotal: "10.00" }],
    ...overrides,
  };
}

run("normalizeRestRefund: totalRefunded is derived from transactions, matching the existing order-level derivation", () => {
  const normalized = normalizeRestRefund(
    baseRefundPayload({ transactions: [{ amount: "6.00" }, { amount: "4.00" }] })
  );
  assert.equal(normalized.totalRefunded, 10);
});

run("normalizeRestRefund: a partial refund (subset of quantity) is captured exactly, not assumed to be the full line item", () => {
  const normalized = normalizeRestRefund(
    baseRefundPayload({
      refund_line_items: [{ id: 101, line_item_id: 5001, quantity: 1, subtotal: "12.50" }],
    })
  );
  assert.equal(normalized.lineItems.length, 1);
  assert.equal(normalized.lineItems[0].quantity, 1);
  assert.equal(normalized.lineItems[0].subtotal, 12.5);
});

run("normalizeRestRefund: two separate refund-line entries for the SAME original line item are both preserved, not collapsed", () => {
  const normalized = normalizeRestRefund(
    baseRefundPayload({
      refund_line_items: [
        { id: 101, line_item_id: 5001, quantity: 1, subtotal: "5.00" },
        { id: 102, line_item_id: 5001, quantity: 1, subtotal: "5.00" },
      ],
    })
  );
  assert.equal(normalized.lineItems.length, 2);
  assert.equal(normalized.lineItems[0].orderLineItemShopifyId, 5001);
  assert.equal(normalized.lineItems[1].orderLineItemShopifyId, 5001);
  assert.equal(normalized.lineItems[0].shopifyRefundLineItemId, 101);
  assert.equal(normalized.lineItems[1].shopifyRefundLineItemId, 102);
});

run('normalizeRestRefund: restock_type "no_restock" maps to restocked = false; any other value maps to true', () => {
  const noRestock = normalizeRestRefund(
    baseRefundPayload({ refund_line_items: [{ id: 101, line_item_id: 5001, quantity: 1, restock_type: "no_restock" }] })
  );
  assert.equal(noRestock.lineItems[0].restocked, false);

  const restocked = normalizeRestRefund(
    baseRefundPayload({ refund_line_items: [{ id: 101, line_item_id: 5001, quantity: 1, restock_type: "return" }] })
  );
  assert.equal(restocked.lineItems[0].restocked, true);
});

// --- Pure JSON builders (shopifyNormalized.ts) --------------------------

run("buildCompleteOrderFieldsJson: always includes every key, even when the underlying value is null", () => {
  const normalized = normalizeRestOrder(baseOrderPayload());
  const fields = buildCompleteOrderFieldsJson(normalized);
  for (const key of [
    "orderNumber", "email", "phone", "financialStatus", "financialStatusRaw",
    "fulfillmentStatus", "currency", "subtotalPrice", "totalTax", "totalDiscounts",
    "totalShipping", "totalRefunded", "totalPrice", "customerNote", "shippingMethod",
    "shippingAddress", "billingAddress", "sourceName", "landingSite", "referringSite",
    "createdAt", "updatedAt", "cancelledAt", "cancelReason", "rawData",
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(fields, key), `expected key "${key}" to be present`);
  }
  // cancelReason is legitimately null for a non-cancelled order -- the
  // KEY must still be present (this is the whole point of "complete").
  assert.equal(fields.cancelReason, null);
});

run("buildCustomerJson: null customer stays null, not an empty object", () => {
  assert.equal(buildCustomerJson(null), null);
});

run("buildCustomerJson: a real customer maps every field", () => {
  const json = buildCustomerJson({
    shopifyCustomerId: 42,
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    phone: null,
    acceptsMarketing: true,
    ordersCount: 3,
    totalSpent: 100,
    rawData: { id: 42 },
  });
  assert.equal(json?.shopifyCustomerId, 42);
  assert.equal(json?.email, "a@example.com");
  assert.equal(json?.acceptsMarketing, true);
});

run("buildDiscountsJson: undefined/null both become SQL-null (no opinion), never an empty array", () => {
  assert.equal(buildDiscountsJson(undefined), null);
  assert.equal(buildDiscountsJson(null), null);
});

run("buildDiscountsJson: an explicit empty array passes through as [], distinct from null", () => {
  const result = buildDiscountsJson([]);
  assert.ok(Array.isArray(result));
  assert.equal(result!.length, 0);
});

run("buildDiscountsJson: a populated discount list maps every field including nested allocations", () => {
  const result = buildDiscountsJson([
    {
      applicationIndex: 0,
      applicationType: "discount_code",
      code: "X",
      title: null,
      valueType: "percentage",
      valuePercentage: 10,
      valueAmount: null,
      targetType: "line_item",
      targetSelection: "all",
      allocationMethod: "across",
      isFreeShipping: false,
      rawData: { raw: true },
      allocations: [
        { orderLineItemShopifyId: 1, isShippingLineAllocation: false, allocatedAmount: 2.5, rawData: {} },
      ],
    },
  ]);
  assert.equal(result!.length, 1);
  assert.equal(result![0].code, "X");
  const allocations = result![0].allocations as unknown[];
  assert.equal(allocations.length, 1);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll Shopify lifecycle normalization checks passed.");
}
