import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isCrossbarAddon,
  parseVariantTitle,
  parseVendor,
  buildPropertiesText,
} from "@/lib/shopifyParsing";

// Shapes below cover only the fields this ingest logic reads, and every
// field is read defensively (optional chaining, default to null) -- Shopify
// order payloads vary by API version and store configuration, so nothing
// here assumes a field is always present. Field selection (in particular the
// money-field fallbacks and the refund/shipping derivations) should be
// validated against a real captured order payload during testing.

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

// Upserts the order's customer (if present) and returns its internal id.
// first_seen_at has no DB default and must be set once, on first insert,
// and never overwritten afterward -- a single blind upsert can't express
// "only set this column on insert" via the plain PostgREST client, so this
// is an explicit select-then-branch instead of a one-call upsert.
async function upsertCustomer(customer: ShopifyCustomer | null | undefined): Promise<number | null> {
  if (!customer?.id) return null;

  const nowIso = new Date().toISOString();

  const { data: existing, error: selectError } = await supabaseAdmin
    .from("shopify_customers")
    .select("id")
    .eq("shopify_customer_id", customer.id)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Customer lookup failed: ${selectError.message}`);
  }

  const sharedFields = {
    email: customer.email ?? null,
    first_name: customer.first_name ?? null,
    last_name: customer.last_name ?? null,
    phone: customer.phone ?? null,
    accepts_marketing: customer.accepts_marketing ?? null,
    orders_count: customer.orders_count ?? null,
    total_spent: toNumber(customer.total_spent),
    raw_data: customer,
    last_synced_at: nowIso,
  };

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("shopify_customers")
      .update(sharedFields)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Customer update failed: ${updateError.message}`);
    }
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("shopify_customers")
    .insert({
      shopify_customer_id: customer.id,
      ...sharedFields,
      first_seen_at: nowIso,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Customer insert failed: ${insertError.message}`);
  }
  return inserted.id;
}

// Upserts the order itself, keyed on shopify_order_id. Every field reflects
// the latest known state on every upsert (an orders/updated delivery for the
// same order is expected to just overwrite with fresher data) -- unlike
// shopify_customers, there's no "set once" column here, so created_at is
// simply omitted from the payload and left to the DB default/on-conflict
// behavior to handle correctly for both inserts and updates.
async function upsertOrder(
  payload: ShopifyOrderPayload,
  customerId: number | null
): Promise<{ id: number }> {
  const row = {
    shopify_order_id: payload.id,
    order_number:
      payload.name ?? (payload.order_number != null ? String(payload.order_number) : null),
    customer_id: customerId,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    financial_status: payload.financial_status ?? null,
    fulfillment_status: payload.fulfillment_status ?? null,
    currency: payload.currency ?? null,
    subtotal_price: toNumber(payload.subtotal_price ?? payload.subtotal_price_set?.shop_money?.amount),
    total_tax: toNumber(payload.total_tax ?? payload.total_tax_set?.shop_money?.amount),
    total_discounts: toNumber(
      payload.total_discounts ?? payload.total_discounts_set?.shop_money?.amount
    ),
    total_shipping: deriveTotalShipping(payload),
    total_refunded: deriveTotalRefunded(payload),
    total_price: toNumber(payload.total_price ?? payload.total_price_set?.shop_money?.amount),
    customer_note: payload.note ?? null,
    shipping_method: payload.shipping_lines?.[0]?.title ?? null,
    shipping_address: payload.shipping_address ?? null,
    billing_address: payload.billing_address ?? null,
    source_name: payload.source_name ?? null,
    landing_site: payload.landing_site ?? null,
    referring_site: payload.referring_site ?? null,
    order_created_at: payload.created_at ?? null,
    order_updated_at: payload.updated_at ?? null,
    cancelled_at: payload.cancelled_at ?? null,
    raw_data: payload,
    source: "webhook",
  };

  const { data, error } = await supabaseAdmin
    .from("shopify_orders")
    .upsert(row, { onConflict: "shopify_order_id" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Order upsert failed: ${error.message}`);
  }
  return data;
}

// Batch-matches team_tags parsed from this order's line items against
// online_stores.vendor_team_tag in one query, to avoid an N+1 lookup when an
// order has multiple items for the same team. No online_stores row is ever
// auto-created here -- unmatched tags are simply left unmatched.
async function matchOnlineStores(teamTags: string[]): Promise<Map<string, number>> {
  const uniqueTags = Array.from(new Set(teamTags.filter((tag): tag is string => Boolean(tag))));
  if (uniqueTags.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("online_stores")
    .select("id, vendor_team_tag")
    .in("vendor_team_tag", uniqueTags);

  if (error) {
    throw new Error(`Online store lookup failed: ${error.message}`);
  }

  const map = new Map<string, number>();
  for (const store of data ?? []) {
    if (store.vendor_team_tag) map.set(store.vendor_team_tag, store.id);
  }
  return map;
}

async function upsertLineItems(orderId: number, lineItems: ShopifyLineItem[]): Promise<void> {
  if (lineItems.length === 0) return;

  const parsedItems = lineItems.map((item) => ({
    item,
    ...parseVendor(item.vendor),
    isAddon: isCrossbarAddon(item.vendor),
    ...parseVariantTitle(item.variant_title),
  }));

  const teamTagsToMatch = parsedItems
    .filter((entry) => !entry.isAddon && entry.teamTag)
    .map((entry) => entry.teamTag as string);
  const storeMap = await matchOnlineStores(teamTagsToMatch);

  const rows = parsedItems.map(({ item, teamTag, itemNumber, isAddon, color, size }) => ({
    order_id: orderId,
    shopify_line_item_id: item.id,
    shopify_product_id: item.product_id ?? null,
    shopify_variant_id: item.variant_id ?? null,
    // catalog_product_id intentionally left null -- catalog matching is a
    // separate, later effort (see plan §6/§12).
    online_store_id: !isAddon && teamTag ? storeMap.get(teamTag) ?? null : null,
    vendor: item.vendor ?? null,
    team_tag: teamTag,
    item_number: itemNumber,
    is_crossbar_addon: isAddon,
    title: item.title ?? null,
    variant_title: item.variant_title ?? null,
    sku: item.sku ?? null,
    color,
    size,
    quantity: item.quantity ?? 1,
    current_quantity: item.current_quantity ?? null,
    price: toNumber(item.price),
    total_discount: toNumber(item.total_discount),
    requires_shipping: item.requires_shipping ?? null,
    taxable: item.taxable ?? null,
    fulfillment_status: item.fulfillment_status ?? null,
    properties: item.properties ?? null,
    properties_text: buildPropertiesText(item.properties),
    raw_data: item,
  }));

  const { error } = await supabaseAdmin
    .from("shopify_order_line_items")
    .upsert(rows, { onConflict: "shopify_line_item_id" });

  if (error) {
    throw new Error(`Line item upsert failed: ${error.message}`);
  }
}

// Normalizes one Shopify order payload: customer -> order -> line items, in
// that order (line items need the order's internal id; the order needs the
// customer's internal id). Every step upserts on Shopify's own stable
// natural id, so reprocessing the same payload any number of times (retry,
// or a legitimate later update) converges to the same rows rather than
// duplicating anything.
export async function processShopifyOrder(payload: ShopifyOrderPayload): Promise<{ orderId: number }> {
  const customerId = await upsertCustomer(payload.customer);
  const order = await upsertOrder(payload, customerId);
  await upsertLineItems(order.id, payload.line_items ?? []);
  return { orderId: order.id };
}
