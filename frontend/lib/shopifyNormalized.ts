import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCrossbarAddon,
  parseVariantTitle,
  parseVendor,
  buildPropertiesText,
} from "@/lib/shopifyParsing";

// Canonical, DB-ready representation of a Shopify order, independent of
// which Shopify API produced it. Both the REST webhook adapter
// (shopifyRestAdapter.ts) and the GraphQL historical-import adapter
// (shopifyGraphQLAdapter.ts) normalize into this shape; everything below
// this point -- upserts, vendor parsing, add-on detection, store matching --
// lives in exactly one place so the two ingestion paths can never drift.

export interface NormalizedShopifyCustomer {
  shopifyCustomerId: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  acceptsMarketing: boolean | null;
  ordersCount: number | null;
  totalSpent: number | null;
  rawData: unknown;
}

export interface NormalizedShopifyLineItem {
  shopifyLineItemId: number;
  shopifyProductId: number | null;
  shopifyVariantId: number | null;
  vendor: string | null;
  title: string | null;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  currentQuantity: number | null;
  price: number | null;
  totalDiscount: number | null;
  requiresShipping: boolean | null;
  taxable: boolean | null;
  fulfillmentStatus: string | null;
  properties: { name: string; value: string }[] | null;
  rawData: unknown;
}

export interface NormalizedShopifyOrder {
  shopifyOrderId: number;
  orderNumber: string | null;
  customer: NormalizedShopifyCustomer | null;
  email: string | null;
  phone: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  currency: string | null;
  subtotalPrice: number | null;
  totalTax: number | null;
  totalDiscounts: number | null;
  totalShipping: number | null;
  totalRefunded: number | null;
  totalPrice: number | null;
  customerNote: string | null;
  shippingMethod: string | null;
  shippingAddress: Record<string, unknown> | null;
  billingAddress: Record<string, unknown> | null;
  sourceName: string | null;
  landingSite: string | null;
  referringSite: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  cancelledAt: string | null;
  rawData: unknown;
  lineItems: NormalizedShopifyLineItem[];
}

export type ShopifyOrderSource = "webhook" | "historical_import";

// Upserts the order's customer (if present) and returns its internal id.
// first_seen_at has no DB default and must be set once, on first insert,
// and never overwritten afterward -- a single blind upsert can't express
// "only set this column on insert" via the plain PostgREST client, so this
// is an explicit select-then-branch instead of a one-call upsert.
async function upsertCustomer(
  client: SupabaseClient,
  customer: NormalizedShopifyCustomer | null
): Promise<number | null> {
  if (!customer) return null;

  const nowIso = new Date().toISOString();

  const { data: existing, error: selectError } = await client
    .from("shopify_customers")
    .select("id")
    .eq("shopify_customer_id", customer.shopifyCustomerId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Customer lookup failed: ${selectError.message}`);
  }

  const sharedFields = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
    accepts_marketing: customer.acceptsMarketing,
    orders_count: customer.ordersCount,
    total_spent: customer.totalSpent,
    raw_data: customer.rawData,
    last_synced_at: nowIso,
  };

  if (existing) {
    const { error: updateError } = await client
      .from("shopify_customers")
      .update(sharedFields)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Customer update failed: ${updateError.message}`);
    }
    return existing.id;
  }

  const { data: inserted, error: insertError } = await client
    .from("shopify_customers")
    .insert({
      shopify_customer_id: customer.shopifyCustomerId,
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
// the latest known state on every touch, EXCEPT `source`: that column
// records how the order was first ingested (webhook vs. historical_import)
// and must never be overwritten by a later touch from either path -- a
// historical backfill must not flip an existing webhook order to
// 'historical_import', and symmetrically a later webhook update must not
// flip a backfilled order back to 'webhook'. Mirrors the same
// set-once-preserve-forever pattern as shopify_customers.first_seen_at
// above, via select-then-branch rather than a blind upsert.
async function upsertOrder(
  client: SupabaseClient,
  normalized: NormalizedShopifyOrder,
  customerId: number | null,
  source: ShopifyOrderSource
): Promise<{ id: number; isNew: boolean }> {
  const { data: existing, error: selectError } = await client
    .from("shopify_orders")
    .select("id")
    .eq("shopify_order_id", normalized.shopifyOrderId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Order lookup failed: ${selectError.message}`);
  }

  const sharedFields = {
    order_number: normalized.orderNumber,
    customer_id: customerId,
    email: normalized.email,
    phone: normalized.phone,
    financial_status: normalized.financialStatus,
    fulfillment_status: normalized.fulfillmentStatus,
    currency: normalized.currency,
    subtotal_price: normalized.subtotalPrice,
    total_tax: normalized.totalTax,
    total_discounts: normalized.totalDiscounts,
    total_shipping: normalized.totalShipping,
    total_refunded: normalized.totalRefunded,
    total_price: normalized.totalPrice,
    customer_note: normalized.customerNote,
    shipping_method: normalized.shippingMethod,
    shipping_address: normalized.shippingAddress,
    billing_address: normalized.billingAddress,
    source_name: normalized.sourceName,
    landing_site: normalized.landingSite,
    referring_site: normalized.referringSite,
    order_created_at: normalized.createdAt,
    order_updated_at: normalized.updatedAt,
    cancelled_at: normalized.cancelledAt,
    raw_data: normalized.rawData,
  };

  if (existing) {
    const { error: updateError } = await client
      .from("shopify_orders")
      .update(sharedFields)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Order update failed: ${updateError.message}`);
    }
    return { id: existing.id, isNew: false };
  }

  const { data: inserted, error: insertError } = await client
    .from("shopify_orders")
    .insert({
      shopify_order_id: normalized.shopifyOrderId,
      ...sharedFields,
      source,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`Order insert failed: ${insertError.message}`);
  }
  return { id: inserted.id, isNew: true };
}

// Batch-matches team_tags parsed from this order's line items against
// online_stores.vendor_team_tag in one query, to avoid an N+1 lookup when an
// order has multiple items for the same team. No online_stores row is ever
// auto-created here -- unmatched tags are simply left unmatched.
async function matchOnlineStores(
  client: SupabaseClient,
  teamTags: string[]
): Promise<Map<string, number>> {
  const uniqueTags = Array.from(new Set(teamTags.filter((tag): tag is string => Boolean(tag))));
  if (uniqueTags.length === 0) return new Map();

  const { data, error } = await client
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

async function upsertLineItems(
  client: SupabaseClient,
  orderId: number,
  lineItems: NormalizedShopifyLineItem[]
): Promise<{ unmatchedTeamTags: string[] }> {
  if (lineItems.length === 0) return { unmatchedTeamTags: [] };

  const parsedItems = lineItems.map((item) => ({
    item,
    ...parseVendor(item.vendor),
    isAddon: isCrossbarAddon(item.vendor),
    ...parseVariantTitle(item.variantTitle),
  }));

  const teamTagsToMatch = parsedItems
    .filter((entry) => !entry.isAddon && entry.teamTag)
    .map((entry) => entry.teamTag as string);
  const storeMap = await matchOnlineStores(client, teamTagsToMatch);
  const unmatchedTeamTags = Array.from(
    new Set(teamTagsToMatch.filter((tag) => !storeMap.has(tag)))
  );

  const rows = parsedItems.map(({ item, teamTag, itemNumber, isAddon, color, size }) => ({
    order_id: orderId,
    shopify_line_item_id: item.shopifyLineItemId,
    shopify_product_id: item.shopifyProductId,
    shopify_variant_id: item.shopifyVariantId,
    // catalog_product_id intentionally left null -- catalog matching is a
    // separate, later effort.
    online_store_id: !isAddon && teamTag ? storeMap.get(teamTag) ?? null : null,
    vendor: item.vendor,
    team_tag: teamTag,
    item_number: itemNumber,
    is_crossbar_addon: isAddon,
    title: item.title,
    variant_title: item.variantTitle,
    sku: item.sku,
    color,
    size,
    quantity: item.quantity,
    current_quantity: item.currentQuantity,
    price: item.price,
    total_discount: item.totalDiscount,
    requires_shipping: item.requiresShipping,
    taxable: item.taxable,
    fulfillment_status: item.fulfillmentStatus,
    properties: item.properties,
    properties_text: buildPropertiesText(item.properties),
    raw_data: item.rawData,
  }));

  const { error } = await client
    .from("shopify_order_line_items")
    .upsert(rows, { onConflict: "shopify_line_item_id" });

  if (error) {
    throw new Error(`Line item upsert failed: ${error.message}`);
  }

  return { unmatchedTeamTags };
}

export interface UpsertNormalizedOrderResult {
  orderId: number;
  isNewOrder: boolean;
  customerProcessed: boolean;
  lineItemCount: number;
  unmatchedTeamTags: string[];
}

// Normalizes one canonical order: customer -> order -> line items, in that
// order (line items need the order's internal id; the order needs the
// customer's internal id). Every step upserts on Shopify's own stable
// natural id, so reprocessing the same order any number of times (webhook
// retry, or a re-run/overlapping historical import range) converges to the
// same rows rather than duplicating anything. `client` is passed in rather
// than imported, since the two callers need different Supabase client
// instances -- the webhook route uses the server-only-guarded
// lib/supabase-admin.ts client, while the standalone backfill script (run
// outside Next's bundler via tsx) cannot import that guard and constructs
// its own. The returned stats (beyond orderId) exist so the backfill
// script's summary report doesn't need to duplicate any of this logic.
export async function upsertNormalizedOrder(
  client: SupabaseClient,
  normalized: NormalizedShopifyOrder,
  options: { source: ShopifyOrderSource }
): Promise<UpsertNormalizedOrderResult> {
  const customerId = await upsertCustomer(client, normalized.customer);
  const order = await upsertOrder(client, normalized, customerId, options.source);
  const { unmatchedTeamTags } = await upsertLineItems(client, order.id, normalized.lineItems);
  return {
    orderId: order.id,
    isNewOrder: order.isNew,
    customerProcessed: customerId != null,
    lineItemCount: normalized.lineItems.length,
    unmatchedTeamTags,
  };
}
