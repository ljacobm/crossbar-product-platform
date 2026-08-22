import type {
  NormalizedShopifyCustomer,
  NormalizedShopifyLineItem,
  NormalizedShopifyOrder,
} from "@/lib/shopifyNormalized";

// Adapter from Shopify's REST webhook payload shape into the canonical
// NormalizedShopifyOrder. Every field is read defensively (optional
// chaining, default to null) -- Shopify order payloads vary by API version
// and store configuration, so nothing here assumes a field is always
// present. Field selection (in particular the money-field fallbacks and the
// refund/shipping derivations) was validated against a real captured
// webhook payload during Phase 2 testing.

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
  [key: string]: unknown;
}

interface ShopifyShippingLine {
  title?: string | null;
  price?: ShopifyMoney;
}

interface ShopifyRefundTransaction {
  amount?: ShopifyMoney;
}

interface ShopifyRefund {
  transactions?: ShopifyRefundTransaction[] | null;
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
  refunds?: ShopifyRefund[] | null;
  line_items?: ShopifyLineItem[] | null;
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

export function normalizeRestOrder(payload: ShopifyOrderPayload): NormalizedShopifyOrder {
  return {
    shopifyOrderId: payload.id,
    orderNumber:
      payload.name ?? (payload.order_number != null ? String(payload.order_number) : null),
    customer: normalizeRestCustomer(payload.customer),
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    financialStatus: payload.financial_status ?? null,
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
    rawData: payload,
    lineItems: (payload.line_items ?? []).map(normalizeRestLineItem),
  };
}
