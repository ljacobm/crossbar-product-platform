import type {
  NormalizedShopifyCustomer,
  NormalizedShopifyFulfillment,
  NormalizedShopifyLineItem,
  NormalizedShopifyOrder,
  NormalizedShopifyOrderDiscount,
  NormalizedShopifyRefund,
} from "@/lib/shopifyNormalized";

// Adapter from Shopify's REST webhook payload shape into the canonical
// NormalizedShopifyOrder. Every field is read defensively (optional
// chaining, default to null) -- Shopify order payloads vary by API version
// and store configuration, so nothing here assumes a field is always
// present. Field selection (in particular the money-field fallbacks and the
// refund/shipping derivations) was validated against a real captured
// webhook payload during Phase 2 testing.
//
// Phase 1, Milestone 2: also normalizes the Fulfillment and Refund REST
// resources (normalizeRestFulfillment/normalizeRestRefund below) -- each
// arrives as its OWN top-level webhook body for the fulfillments/*/
// refunds/* topics (not nested inside an order payload the way
// cancel_reason/discount_applications are), and order-level
// cancel_reason/discount_applications/discount_allocations, previously
// unread. The discount_applications/discount_allocations field names
// and the Fulfillment/Refund resource field names below (tracking_
// numbers/tracking_urls, refund_line_items, restock_type, etc.) are
// written from current Shopify REST API knowledge, not independently
// confirmed against a live captured payload the way the order-level
// money/refund fields above were -- per the Phase 1 plan, verify each
// of these against a real webhook delivery (captured automatically in
// shopify_webhook_events.payload once a topic is subscribed) before
// relying on them in production, and adjust here if the real payload
// shape differs. In particular: whether REST's discount_applications[].type
// ever reports "automatic" for Shopify's automatic-discounts feature, as
// opposed to only "discount_code"/"manual"/"script", is unconfirmed.

type ShopifyMoney = string | number | null | undefined;

interface ShopifyMoneySet {
  shop_money?: { amount?: ShopifyMoney } | null;
}

interface ShopifyCustomer {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  accepts_marketing?: boolean | null;
  orders_count?: number | null;
  total_spent?: ShopifyMoney;
  [key: string]: unknown;
}

interface ShopifyLineItemProperty {
  name?: string | null;
  value?: string | null;
}

// Phase 1, Milestone 2: a discount amount allocated to one line item or
// shipping line. discount_application_index refers back to the
// position of the corresponding entry in the order's own top-level
// discount_applications array (see buildDiscountsFromRest below) --
// REST has no separate id for either the application or the
// allocation, matching the lack of a stable id confirmed on GraphQL's
// equivalent DiscountApplication/DiscountAllocation types.
interface ShopifyDiscountAllocation {
  amount?: ShopifyMoney;
  discount_application_index?: number | null;
  [key: string]: unknown;
}

interface ShopifyLineItem {
  id: number;
  product_id?: number | null;
  variant_id?: number | null;
  vendor?: string | null;
  title?: string | null;
  variant_title?: string | null;
  sku?: string | null;
  quantity?: number | null;
  current_quantity?: number | null;
  price?: ShopifyMoney;
  total_discount?: ShopifyMoney;
  requires_shipping?: boolean | null;
  taxable?: boolean | null;
  fulfillment_status?: string | null;
  properties?: ShopifyLineItemProperty[] | null;
  discount_allocations?: ShopifyDiscountAllocation[] | null;
  [key: string]: unknown;
}

interface ShopifyShippingLine {
  title?: string | null;
  price?: ShopifyMoney;
  discount_allocations?: ShopifyDiscountAllocation[] | null;
}

interface ShopifyRefundTransaction {
  amount?: ShopifyMoney;
}

interface ShopifyRefund {
  transactions?: ShopifyRefundTransaction[] | null;
}

// Phase 1, Milestone 2: one entry of an order's top-level
// discount_applications array -- describes the discount's rules
// (code/automatic/manual/script, percentage/fixed, target); the actual
// dollar amounts taken off specific lines/shipping live in each line
// item's/shipping line's own discount_allocations above, cross-
// referenced back here by array position (discount_application_index).
interface ShopifyDiscountApplication {
  target_type?: string | null;
  target_selection?: string | null;
  allocation_method?: string | null;
  value?: ShopifyMoney;
  value_type?: string | null;
  code?: string | null;
  title?: string | null;
  description?: string | null;
  type?: string | null;
  [key: string]: unknown;
}

export interface ShopifyOrderPayload {
  id: number;
  order_number?: number | string | null;
  name?: string | null;
  customer?: ShopifyCustomer | null;
  email?: string | null;
  phone?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  currency?: string | null;
  subtotal_price?: ShopifyMoney;
  subtotal_price_set?: ShopifyMoneySet | null;
  total_tax?: ShopifyMoney;
  total_tax_set?: ShopifyMoneySet | null;
  total_discounts?: ShopifyMoney;
  total_discounts_set?: ShopifyMoneySet | null;
  total_shipping_price_set?: ShopifyMoneySet | null;
  total_price?: ShopifyMoney;
  total_price_set?: ShopifyMoneySet | null;
  note?: string | null;
  shipping_lines?: ShopifyShippingLine[] | null;
  shipping_address?: Record<string, unknown> | null;
  billing_address?: Record<string, unknown> | null;
  source_name?: string | null;
  landing_site?: string | null;
  referring_site?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  cancelled_at?: string | null;
  // "customer" | "inventory" | "fraud" | "declined" | "other" per
  // REST's documented values -- GraphQL's OrderCancelReason enum also
  // includes a sixth, "staff", confirmed against current Shopify docs;
  // passed through as-is here either way, never validated against a
  // fixed list, so an unexpected value is preserved rather than dropped.
  cancel_reason?: string | null;
  refunds?: ShopifyRefund[] | null;
  line_items?: ShopifyLineItem[] | null;
  // Rules/metadata for every discount applied to this order, in
  // display/application order -- see buildDiscountsFromRest below.
  discount_applications?: ShopifyDiscountApplication[] | null;
  [key: string]: unknown;
}

function toNumber(value: ShopifyMoney): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function deriveTotalShipping(payload: ShopifyOrderPayload): number | null {
  const setAmount = payload.total_shipping_price_set?.shop_money?.amount;
  if (setAmount != null) return toNumber(setAmount);

  const shippingLines = payload.shipping_lines;
  if (!shippingLines || shippingLines.length === 0) return null;

  return shippingLines.reduce((total, line) => total + (toNumber(line.price) ?? 0), 0);
}

function deriveTotalRefunded(payload: ShopifyOrderPayload): number | null {
  const refunds = payload.refunds;
  if (!refunds || refunds.length === 0) return null;

  const sum = refunds.reduce((total, refund) => {
    const transactions = refund.transactions ?? [];
    const refundSum = transactions.reduce((t, tx) => t + (toNumber(tx.amount) ?? 0), 0);
    return total + refundSum;
  }, 0);

  return sum > 0 ? sum : null;
}

function normalizeRestCustomer(
  customer: ShopifyCustomer | null | undefined
): NormalizedShopifyCustomer | null {
  if (!customer?.id) return null;

  return {
    shopifyCustomerId: customer.id,
    email: customer.email ?? null,
    firstName: customer.first_name ?? null,
    lastName: customer.last_name ?? null,
    phone: customer.phone ?? null,
    acceptsMarketing: customer.accepts_marketing ?? null,
    ordersCount: customer.orders_count ?? null,
    totalSpent: toNumber(customer.total_spent),
    rawData: customer,
  };
}

function normalizeRestLineItem(item: ShopifyLineItem): NormalizedShopifyLineItem {
  return {
    shopifyLineItemId: item.id,
    shopifyProductId: item.product_id ?? null,
    shopifyVariantId: item.variant_id ?? null,
    vendor: item.vendor ?? null,
    title: item.title ?? null,
    variantTitle: item.variant_title ?? null,
    sku: item.sku ?? null,
    quantity: item.quantity ?? 1,
    currentQuantity: item.current_quantity ?? null,
    price: toNumber(item.price),
    totalDiscount: toNumber(item.total_discount),
    requiresShipping: item.requires_shipping ?? null,
    taxable: item.taxable ?? null,
    fulfillmentStatus: item.fulfillment_status ?? null,
    properties:
      item.properties?.map((prop) => ({ name: prop.name ?? "", value: prop.value ?? "" })) ?? null,
    rawData: item,
  };
}

// Phase 1, Milestone 2. Returns `null` (not `[]`) when the order payload
// doesn't carry a discount_applications field AT ALL -- distinct from an
// empty array, which means Shopify explicitly reported zero discounts.
// This null/array distinction is exactly what flows through to
// NormalizedShopifyOrder.discounts -> buildDiscountsJson() ->
// sync_shopify_order()'s own "no opinion" vs "confirmed empty" handling
// (see the migration's JSON CONTRACT comment). Every real order/*
// REST webhook payload is expected to include this field (even as `[]`)
// per current Shopify docs -- `undefined` here would only occur against
// an unusually old/stripped-down payload, and is handled the same safe
// way regardless.
function buildDiscountsFromRest(
  payload: ShopifyOrderPayload
): NormalizedShopifyOrderDiscount[] | null {
  const applications = payload.discount_applications;
  if (applications == null) return null;

  const discounts: NormalizedShopifyOrderDiscount[] = applications.map((application) => {
    const valueType =
      application.value_type === "percentage"
        ? "percentage"
        : application.value_type === "fixed_amount"
          ? "fixed_amount"
          : null;
    const value = toNumber(application.value);

    return {
      // Overwritten below once every application has been mapped --
      // kept here only so TypeScript sees a complete object per entry;
      // the real value is this entry's position in `applications`.
      applicationIndex: 0,
      // Pass through as-is (lowercased) rather than validating against a
      // fixed list -- "automatic" has not been independently confirmed
      // to appear in a real REST discount_applications payload (see
      // file header); better to preserve whatever Shopify actually sent
      // than to silently coerce it to something else.
      applicationType: (application.type ?? "manual").toLowerCase(),
      code: application.code ?? null,
      title: application.title ?? application.description ?? null,
      valueType,
      valuePercentage: valueType === "percentage" ? value : null,
      valueAmount: valueType === "fixed_amount" ? value : null,
      targetType:
        application.target_type === "shipping_line"
          ? "shipping_line"
          : application.target_type === "line_item"
            ? "line_item"
            : null,
      targetSelection: application.target_selection ?? null,
      allocationMethod: application.allocation_method ?? null,
      // Best-effort heuristic, not an authoritative Shopify field (none
      // exists) -- a 100%-off discount targeted at the shipping line.
      // Verify against a real free-shipping test order before trusting
      // this in any user-facing context.
      isFreeShipping:
        application.target_type === "shipping_line" && valueType === "percentage" && value === 100,
      rawData: application,
      allocations: [],
    };
  });

  discounts.forEach((discount, index) => {
    discount.applicationIndex = index;
  });

  const pushAllocation = (
    allocations: ShopifyDiscountAllocation[] | null | undefined,
    orderLineItemShopifyId: number | null,
    isShippingLineAllocation: boolean
  ) => {
    for (const allocation of allocations ?? []) {
      const index = allocation.discount_application_index;
      if (index == null) continue;
      const discount = discounts[index];
      if (!discount) continue;
      discount.allocations.push({
        orderLineItemShopifyId,
        isShippingLineAllocation,
        allocatedAmount: toNumber(allocation.amount),
        rawData: allocation,
      });
    }
  };

  for (const item of payload.line_items ?? []) {
    pushAllocation(item.discount_allocations, item.id, false);
  }
  for (const line of payload.shipping_lines ?? []) {
    pushAllocation(line.discount_allocations, null, true);
  }

  return discounts;
}

export function normalizeRestOrder(payload: ShopifyOrderPayload): NormalizedShopifyOrder {
  return {
    shopifyOrderId: payload.id,
    orderNumber:
      payload.name ?? (payload.order_number != null ? String(payload.order_number) : null),
    customer: normalizeRestCustomer(payload.customer),
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    financialStatus: payload.financial_status ?? null,
    // REST is already the canonical (lowercase) casing -- unlike
    // GraphQL's displayFinancialStatus, which is uppercase and never
    // flows through this adapter. Preserved separately anyway, matching
    // the SQL contract every caller is expected to fill in.
    financialStatusRaw: payload.financial_status ?? null,
    fulfillmentStatus: payload.fulfillment_status ?? null,
    currency: payload.currency ?? null,
    subtotalPrice: toNumber(payload.subtotal_price ?? payload.subtotal_price_set?.shop_money?.amount),
    totalTax: toNumber(payload.total_tax ?? payload.total_tax_set?.shop_money?.amount),
    totalDiscounts: toNumber(
      payload.total_discounts ?? payload.total_discounts_set?.shop_money?.amount
    ),
    totalShipping: deriveTotalShipping(payload),
    totalRefunded: deriveTotalRefunded(payload),
    totalPrice: toNumber(payload.total_price ?? payload.total_price_set?.shop_money?.amount),
    customerNote: payload.note ?? null,
    shippingMethod: payload.shipping_lines?.[0]?.title ?? null,
    shippingAddress: payload.shipping_address ?? null,
    billingAddress: payload.billing_address ?? null,
    sourceName: payload.source_name ?? null,
    landingSite: payload.landing_site ?? null,
    referringSite: payload.referring_site ?? null,
    createdAt: payload.created_at ?? null,
    updatedAt: payload.updated_at ?? null,
    cancelledAt: payload.cancelled_at ?? null,
    cancelReason: payload.cancel_reason ?? null,
    rawData: payload,
    lineItems: (payload.line_items ?? []).map(normalizeRestLineItem),
    discounts: buildDiscountsFromRest(payload),
  };
}

// =============================================================================
// Phase 1, Milestone 2: Fulfillment and Refund REST webhook payloads --
// each arrives as its OWN top-level webhook body for the
// fulfillments/create|update and refunds/create topics respectively,
// never nested inside an order payload.
// =============================================================================

interface ShopifyFulfillmentLineItemPayload {
  // The ORIGINAL order line item's own id -- REST's Fulfillment.
  // line_items entries repeat it directly rather than exposing a
  // separate "fulfillment line item id" of their own.
  id: number;
  quantity?: number | null;
  [key: string]: unknown;
}

export interface ShopifyFulfillmentPayload {
  id: number;
  order_id: number;
  status?: string | null;
  shipment_status?: string | null;
  tracking_company?: string | null;
  tracking_number?: string | null;
  tracking_numbers?: string[] | null;
  tracking_url?: string | null;
  tracking_urls?: string[] | null;
  location_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  line_items?: ShopifyFulfillmentLineItemPayload[] | null;
  [key: string]: unknown;
}

export function normalizeRestFulfillment(
  payload: ShopifyFulfillmentPayload
): NormalizedShopifyFulfillment {
  // REST exposes both a single tracking_number/tracking_url (older,
  // single-package shape) and tracking_numbers/tracking_urls (arrays,
  // multi-package) -- prefer the arrays when present, falling back to
  // wrapping the singular field in a one-element array otherwise, so a
  // caller never has to know which shape a given delivery used.
  const trackingNumbers =
    payload.tracking_numbers && payload.tracking_numbers.length > 0
      ? payload.tracking_numbers
      : payload.tracking_number
        ? [payload.tracking_number]
        : [];
  const trackingUrls =
    payload.tracking_urls && payload.tracking_urls.length > 0
      ? payload.tracking_urls
      : payload.tracking_url
        ? [payload.tracking_url]
        : [];

  const lineItems = payload.line_items ?? [];
  const totalQuantity = lineItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0);

  return {
    shopifyFulfillmentId: payload.id,
    status: payload.status ?? null,
    // GraphQL-only concept (FulfillmentDisplayStatus) -- REST has no
    // equivalent separate field.
    displayStatus: null,
    shipmentStatus: payload.shipment_status ?? null,
    trackingCompany: payload.tracking_company ?? null,
    trackingNumbers,
    trackingUrls,
    shopifyLocationId: payload.location_id ?? null,
    totalQuantity: lineItems.length > 0 ? totalQuantity : null,
    // Not a Fulfillment-level REST field (it's a per-line-item property
    // on the order itself).
    requiresShipping: null,
    createdAtShopify: payload.created_at ?? null,
    updatedAtShopify: payload.updated_at ?? null,
    // GraphQL-only fields, not present on the REST Fulfillment resource.
    inTransitAt: null,
    deliveredAt: null,
    estimatedDeliveryAt: null,
    rawData: payload,
    lineItems: lineItems.map((item) => ({
      orderLineItemShopifyId: item.id,
      shopifyFulfillmentLineItemId: null,
      quantity: item.quantity ?? 0,
    })),
  };
}

interface ShopifyRefundLineItemPayload {
  id?: number | null;
  line_item_id: number;
  quantity?: number | null;
  subtotal?: ShopifyMoney;
  total_tax?: ShopifyMoney;
  // "no_restock" | "cancel" | "return" | "legacy_restock" per current
  // Shopify docs.
  restock_type?: string | null;
  [key: string]: unknown;
}

interface ShopifyRefundTransactionPayload {
  amount?: ShopifyMoney;
}

export interface ShopifyRefundPayload {
  id: number;
  order_id: number;
  note?: string | null;
  restock?: boolean | null;
  created_at?: string | null;
  processed_at?: string | null;
  transactions?: ShopifyRefundTransactionPayload[] | null;
  refund_line_items?: ShopifyRefundLineItemPayload[] | null;
  [key: string]: unknown;
}

// Refund has no total-dollar-amount field of its own on the REST
// resource -- summing transactions is the same derivation
// deriveTotalRefunded() above already applies to an order's embedded
// refunds array, just against this payload's own transactions list.
function deriveRefundTransactionTotal(payload: ShopifyRefundPayload): number | null {
  const transactions = payload.transactions ?? [];
  const sum = transactions.reduce((total, tx) => total + (toNumber(tx.amount) ?? 0), 0);
  return sum > 0 ? sum : null;
}

export function normalizeRestRefund(payload: ShopifyRefundPayload): NormalizedShopifyRefund {
  return {
    shopifyRefundId: payload.id,
    note: payload.note ?? null,
    totalRefunded: deriveRefundTransactionTotal(payload),
    // Not separately derivable from this payload's top-level fields
    // without parsing order_adjustments -- deferred; total_refunded on
    // shopify_orders (the existing, already-derived aggregate) is
    // unaffected either way.
    totalRefundedShipping: null,
    restocked: payload.restock ?? null,
    processedAt: payload.processed_at ?? null,
    createdAtShopify: payload.created_at ?? null,
    rawData: payload,
    lineItems: (payload.refund_line_items ?? []).map((item) => ({
      orderLineItemShopifyId: item.line_item_id,
      shopifyRefundLineItemId: item.id ?? null,
      quantity: item.quantity ?? 0,
      subtotal: toNumber(item.subtotal),
      totalTax: toNumber(item.total_tax),
      // REST's refund_line_items doesn't carry a standalone unit-price
      // field distinct from subtotal.
      price: null,
      restockType: item.restock_type ?? null,
      restocked: item.restock_type != null && item.restock_type !== "no_restock",
    })),
  };
}
