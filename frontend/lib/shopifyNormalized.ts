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

  // Phase 1, Milestone 2: new, optional fields -- every existing caller
  // (the live orders/create webhook, the historical backfill) simply
  // never sets these, and the OLD write path (upsertOrder/
  // upsertNormalizedOrder below) never reads them, so their addition
  // here is purely additive and changes no existing behavior.
  //
  // cancelReason/financialStatusRaw: see shopifyRestAdapter.ts.
  //
  // discounts has three meaningfully different states, preserved all
  // the way through to the sync_shopify_order() RPC call (see
  // buildDiscountsJson below and the migration's own JSON CONTRACT
  // comment): `undefined` (this adapter/topic never looked at discount
  // data at all -- "no opinion", existing rows untouched), `null`
  // (discount capture is disabled via SHOPIFY_CAPTURE_DISCOUNTS --
  // ingestLifecycle.ts explicitly sets this before calling the RPC
  // layer, also "no opinion"), or an array (including an empty one,
  // meaning "confirmed zero discounts right now").
  cancelReason?: string | null;
  financialStatusRaw?: string | null;
  discounts?: NormalizedShopifyOrderDiscount[] | null;
}

export interface NormalizedShopifyOrderDiscountAllocation {
  // Null for a shipping-line allocation (isShippingLineAllocation true).
  orderLineItemShopifyId: number | null;
  isShippingLineAllocation: boolean;
  allocatedAmount: number | null;
  rawData: unknown;
}

export interface NormalizedShopifyOrderDiscount {
  // Ordinal position within the order's discount list AT THE TIME OF
  // FETCH -- not a stable Shopify id (none exists). See the migration's
  // full-replace-per-order-touch rationale.
  applicationIndex: number;
  applicationType: "automatic" | "discount_code" | "manual" | "script" | string;
  code: string | null;
  title: string | null;
  valueType: "percentage" | "fixed_amount" | null;
  valuePercentage: number | null;
  valueAmount: number | null;
  targetType: "line_item" | "shipping_line" | null;
  targetSelection: string | null;
  allocationMethod: string | null;
  // Best-effort heuristic -- Shopify exposes no dedicated field for
  // this. See shopifyRestAdapter.ts's derivation and its caveats.
  isFreeShipping: boolean;
  rawData: unknown;
  allocations: NormalizedShopifyOrderDiscountAllocation[];
}

export interface NormalizedShopifyFulfillmentLineItem {
  orderLineItemShopifyId: number;
  // REST's Fulfillment.line_items entries repeat the ORDER line item's
  // own id -- they don't have a separate "fulfillment line item id" of
  // their own, so this is null for every REST-sourced fulfillment.
  shopifyFulfillmentLineItemId: number | null;
  quantity: number;
}

export interface NormalizedShopifyFulfillment {
  shopifyFulfillmentId: number;
  status: string | null;
  displayStatus: string | null;
  shipmentStatus: string | null;
  trackingCompany: string | null;
  trackingNumbers: string[];
  trackingUrls: string[];
  shopifyLocationId: number | null;
  totalQuantity: number | null;
  requiresShipping: boolean | null;
  createdAtShopify: string | null;
  updatedAtShopify: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryAt: string | null;
  rawData: unknown;
  lineItems: NormalizedShopifyFulfillmentLineItem[];
}

export interface NormalizedShopifyRefundLineItem {
  orderLineItemShopifyId: number;
  // REST's refund_line_items DO carry their own stable id (unlike
  // GraphQL's RefundLineItem.id, which is nullable/newer) -- preserved
  // here for reference, but never relied on for uniqueness (see the
  // migration's full-replace-per-refund-touch rationale, which treats
  // every entry as independent regardless of whether this is present).
  shopifyRefundLineItemId: number | null;
  quantity: number;
  subtotal: number | null;
  totalTax: number | null;
  price: number | null;
  restockType: string | null;
  restocked: boolean;
}

export interface NormalizedShopifyRefund {
  shopifyRefundId: number;
  note: string | null;
  totalRefunded: number | null;
  totalRefundedShipping: number | null;
  restocked: boolean | null;
  processedAt: string | null;
  createdAtShopify: string | null;
  rawData: unknown;
  lineItems: NormalizedShopifyRefundLineItem[];
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

export interface ParsedLineItemMatch {
  item: NormalizedShopifyLineItem;
  teamTag: string | null;
  itemNumber: string | null;
  isAddon: boolean;
  color: string | null;
  size: string | null;
}

export interface LineItemStoreMatchResult {
  parsedItems: ParsedLineItemMatch[];
  storeMap: Map<string, number>;
  unmatchedTeamTags: string[];
}

// Read-only: parses each line item's Vendor into team_tag/item_number,
// detects Crossbar add-ons, parses variant_title into color/size, and
// batch-matches the non-addon team_tags against
// online_stores.vendor_team_tag in one query. Performs no writes -- the
// online_stores lookup is a plain SELECT, so this is safe to call from a
// dry run. This is the exact logic upsertLineItems() uses to build
// online_store_id for each row, extracted so a caller that never intends
// to write (e.g. the historical importer's --dry-run mode) can get
// identical parsing/matching diagnostics without touching any table.
export async function matchLineItemsToStores(
  client: SupabaseClient,
  lineItems: NormalizedShopifyLineItem[]
): Promise<LineItemStoreMatchResult> {
  const parsedItems: ParsedLineItemMatch[] = lineItems.map((item) => ({
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

  return { parsedItems, storeMap, unmatchedTeamTags };
}

async function upsertLineItems(
  client: SupabaseClient,
  orderId: number,
  lineItems: NormalizedShopifyLineItem[]
): Promise<{ unmatchedTeamTags: string[] }> {
  if (lineItems.length === 0) return { unmatchedTeamTags: [] };

  const { parsedItems, storeMap, unmatchedTeamTags } = await matchLineItemsToStores(
    client,
    lineItems
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

// =============================================================================
// Phase 1, Milestone 2: the RPC-based write path, added alongside
// upsertNormalizedOrder() above -- NOT a replacement for it.
// upsertNormalizedOrder() continues to be the one and only path
// ingest.ts's processShopifyOrder() (orders/create) and
// backfillShopifyOrders.ts use -- both completely unchanged, so the
// live production webhook keeps working exactly as it does today and
// never requires the new sync_shopify_*() Postgres functions
// (database/migrations/20261026_add_shopify_order_lifecycle_sync.sql)
// to exist. The functions below are used only by the NEW lifecycle
// webhook topics (app/api/webhooks/shopify/ingestLifecycle.ts), each
// independently gated behind SHOPIFY_LIFECYCLE_TOPICS_ENABLED -- so
// they are never actually invoked anywhere, including in production,
// until a topic is both subscribed (not done in this milestone) and
// explicitly enabled, by which point the target database is expected
// to already have the migration applied.
// =============================================================================

// Always includes every key, even when the underlying value is null --
// this is what preserves today's "a webhook always has the complete
// order object, so always fully overwrite" semantics once this reaches
// sync_shopify_order()'s presence-based (`?` operator) merge logic. A
// future enrichment-pass caller (not built in this milestone) would
// need a DIFFERENT builder that only includes the keys it actually
// re-fetched -- deliberately not this one, so today's callers can't
// accidentally omit a field they didn't mean to.
export function buildCompleteOrderFieldsJson(
  normalized: NormalizedShopifyOrder
): Record<string, unknown> {
  return {
    orderNumber: normalized.orderNumber,
    email: normalized.email,
    phone: normalized.phone,
    financialStatus: normalized.financialStatus,
    financialStatusRaw: normalized.financialStatusRaw ?? normalized.financialStatus,
    fulfillmentStatus: normalized.fulfillmentStatus,
    currency: normalized.currency,
    subtotalPrice: normalized.subtotalPrice,
    totalTax: normalized.totalTax,
    totalDiscounts: normalized.totalDiscounts,
    totalShipping: normalized.totalShipping,
    totalRefunded: normalized.totalRefunded,
    totalPrice: normalized.totalPrice,
    customerNote: normalized.customerNote,
    shippingMethod: normalized.shippingMethod,
    shippingAddress: normalized.shippingAddress,
    billingAddress: normalized.billingAddress,
    sourceName: normalized.sourceName,
    landingSite: normalized.landingSite,
    referringSite: normalized.referringSite,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    cancelledAt: normalized.cancelledAt,
    cancelReason: normalized.cancelReason ?? null,
    rawData: normalized.rawData,
  };
}

export function buildCustomerJson(
  customer: NormalizedShopifyCustomer | null
): Record<string, unknown> | null {
  if (!customer) return null;
  return {
    shopifyCustomerId: customer.shopifyCustomerId,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    acceptsMarketing: customer.acceptsMarketing,
    ordersCount: customer.ordersCount,
    totalSpent: customer.totalSpent,
    rawData: customer.rawData,
  };
}

// `discounts` has three states (see NormalizedShopifyOrder's own
// comment): undefined/null both become SQL NULL ("no opinion," existing
// rows untouched); an array (including empty) is passed through as-is
// ("confirmed set, replace"). This function is pure and exported
// specifically so its missing-vs-empty behavior is unit-testable
// without a database connection.
export function buildDiscountsJson(
  discounts: NormalizedShopifyOrderDiscount[] | null | undefined
): Record<string, unknown>[] | null {
  if (discounts == null) return null;

  return discounts.map((discount) => ({
    applicationIndex: discount.applicationIndex,
    applicationType: discount.applicationType,
    code: discount.code,
    title: discount.title,
    valueType: discount.valueType,
    valuePercentage: discount.valuePercentage,
    valueAmount: discount.valueAmount,
    targetType: discount.targetType,
    targetSelection: discount.targetSelection,
    allocationMethod: discount.allocationMethod,
    isFreeShipping: discount.isFreeShipping,
    rawData: discount.rawData,
    allocations: discount.allocations.map((allocation) => ({
      orderLineItemShopifyId: allocation.orderLineItemShopifyId,
      isShippingLineAllocation: allocation.isShippingLineAllocation,
      allocatedAmount: allocation.allocatedAmount,
      rawData: allocation.rawData,
    })),
  }));
}

// Mirrors upsertLineItems()'s own row-building exactly (same
// matchLineItemsToStores()/buildPropertiesText() calls, same derived
// fields), just producing plain JSON objects for the RPC call instead
// of snake_case DB rows -- so team_tag/online_store/add-on resolution
// can never drift between the two write paths.
async function buildLineItemsJson(
  client: SupabaseClient,
  lineItems: NormalizedShopifyLineItem[]
): Promise<{ rows: Record<string, unknown>[]; unmatchedTeamTags: string[] }> {
  if (lineItems.length === 0) return { rows: [], unmatchedTeamTags: [] };

  const { parsedItems, storeMap, unmatchedTeamTags } = await matchLineItemsToStores(
    client,
    lineItems
  );

  const rows = parsedItems.map(({ item, teamTag, itemNumber, isAddon, color, size }) => ({
    shopifyLineItemId: item.shopifyLineItemId,
    shopifyProductId: item.shopifyProductId,
    shopifyVariantId: item.shopifyVariantId,
    onlineStoreId: !isAddon && teamTag ? storeMap.get(teamTag) ?? null : null,
    vendor: item.vendor,
    teamTag,
    itemNumber,
    isCrossbarAddon: isAddon,
    title: item.title,
    variantTitle: item.variantTitle,
    sku: item.sku,
    color,
    size,
    quantity: item.quantity,
    currentQuantity: item.currentQuantity,
    price: item.price,
    totalDiscount: item.totalDiscount,
    requiresShipping: item.requiresShipping,
    taxable: item.taxable,
    fulfillmentStatus: item.fulfillmentStatus,
    properties: item.properties,
    propertiesText: buildPropertiesText(item.properties),
    rawData: item.rawData,
  }));

  return { rows, unmatchedTeamTags };
}

// A single row from a RETURNS TABLE Postgres function comes back from
// PostgREST as an array (even though these functions always return 0 or
// 1 row) -- this normalizes that for every RPC call below.
function firstRpcRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export interface SyncShopifyOrderOptions {
  source: ShopifyOrderSource;
  // True only when the caller has confirmed lineItems represents the
  // order's complete, current line-item list -- see the migration's
  // JSON CONTRACT comment. Never true for orders/edited until its real
  // payload shape is captured and confirmed (see ingestLifecycle.ts).
  isCompleteLineItemSnapshot: boolean;
  isEditEvent?: boolean;
}

export interface SyncShopifyOrderRpcResult {
  orderId: number;
  isNewOrder: boolean;
  applied: boolean;
  unmatchedTeamTags: string[];
}

// Writes one order touch through the atomic sync_shopify_order()
// Postgres function instead of the plain upsertOrder()/upsertLineItems()
// path above. Used only by the new lifecycle topics
// (orders/updated|cancelled|edited) -- never by orders/create, never by
// the historical backfill, in this milestone.
export async function syncShopifyOrderViaRpc(
  client: SupabaseClient,
  normalized: NormalizedShopifyOrder,
  options: SyncShopifyOrderOptions
): Promise<SyncShopifyOrderRpcResult> {
  const { rows: lineItemRows, unmatchedTeamTags } = await buildLineItemsJson(
    client,
    normalized.lineItems
  );

  const { data, error } = await client.rpc("sync_shopify_order", {
    p_shopify_order_id: normalized.shopifyOrderId,
    p_customer: buildCustomerJson(normalized.customer),
    p_order_fields: buildCompleteOrderFieldsJson(normalized),
    p_line_items: lineItemRows,
    p_is_complete_line_item_snapshot: options.isCompleteLineItemSnapshot,
    p_discounts: buildDiscountsJson(normalized.discounts),
    p_source: options.source,
    p_is_edit_event: options.isEditEvent ?? false,
  });

  if (error) {
    throw new Error(`sync_shopify_order RPC failed: ${error.message}`);
  }

  const row = firstRpcRow<{ id: number; applied: boolean; is_new: boolean }>(data);
  if (!row) {
    throw new Error("sync_shopify_order RPC returned no row");
  }

  return {
    orderId: row.id,
    isNewOrder: row.is_new,
    applied: row.applied,
    unmatchedTeamTags,
  };
}

export interface SyncShopifyFulfillmentRpcResult {
  fulfillmentId: number;
  applied: boolean;
  orderId: number;
}

export async function syncShopifyFulfillmentViaRpc(
  client: SupabaseClient,
  shopifyOrderId: number,
  fulfillment: NormalizedShopifyFulfillment
): Promise<SyncShopifyFulfillmentRpcResult> {
  const { data, error } = await client.rpc("sync_shopify_fulfillment", {
    p_shopify_order_id: shopifyOrderId,
    p_shopify_fulfillment_id: fulfillment.shopifyFulfillmentId,
    p_fields: {
      status: fulfillment.status,
      displayStatus: fulfillment.displayStatus,
      shipmentStatus: fulfillment.shipmentStatus,
      trackingCompany: fulfillment.trackingCompany,
      trackingNumbers: fulfillment.trackingNumbers,
      trackingUrls: fulfillment.trackingUrls,
      shopifyLocationId: fulfillment.shopifyLocationId,
      totalQuantity: fulfillment.totalQuantity,
      requiresShipping: fulfillment.requiresShipping,
      createdAtShopify: fulfillment.createdAtShopify,
      updatedAtShopify: fulfillment.updatedAtShopify,
      inTransitAt: fulfillment.inTransitAt,
      deliveredAt: fulfillment.deliveredAt,
      estimatedDeliveryAt: fulfillment.estimatedDeliveryAt,
      rawData: fulfillment.rawData,
    },
    p_line_items: fulfillment.lineItems.map((lineItem) => ({
      orderLineItemShopifyId: lineItem.orderLineItemShopifyId,
      shopifyFulfillmentLineItemId: lineItem.shopifyFulfillmentLineItemId,
      quantity: lineItem.quantity,
    })),
  });

  if (error) {
    throw new Error(`sync_shopify_fulfillment RPC failed: ${error.message}`);
  }

  const row = firstRpcRow<{ id: number; applied: boolean; order_id: number }>(data);
  if (!row) {
    throw new Error("sync_shopify_fulfillment RPC returned no row");
  }

  return { fulfillmentId: row.id, applied: row.applied, orderId: row.order_id };
}

export interface SyncShopifyOrderDiscountsRpcResult {
  applied: boolean;
}

// Phase 1, Milestone 3: writes JUST an order's discount set, independent
// of the rest of an order touch -- backs the new, additive discount
// capture call in ingest.ts's processShopifyOrder() (orders/create),
// which deliberately does not route through the full sync_shopify_order
// RPC (that would change orders/create's existing order/line-item
// write path -- see database/migrations/
// 20261029_extract_shopify_order_discounts_sync.sql for the extraction
// rationale). sync_shopify_order() itself also calls the same SQL
// function internally now, so orders/updated|cancelled|edited's
// discount behavior is unchanged.
export async function syncShopifyOrderDiscountsViaRpc(
  client: SupabaseClient,
  shopifyOrderId: number,
  discounts: NormalizedShopifyOrderDiscount[] | null | undefined
): Promise<SyncShopifyOrderDiscountsRpcResult> {
  const { data, error } = await client.rpc("sync_shopify_order_discounts", {
    p_shopify_order_id: shopifyOrderId,
    p_discounts: buildDiscountsJson(discounts),
  });

  if (error) {
    throw new Error(`sync_shopify_order_discounts RPC failed: ${error.message}`);
  }

  const row = firstRpcRow<{ applied: boolean }>(data);
  if (!row) {
    throw new Error("sync_shopify_order_discounts RPC returned no row");
  }

  return { applied: row.applied };
}

export interface SyncShopifyRefundRpcResult {
  refundId: number;
  applied: boolean;
  orderId: number;
}

export async function syncShopifyRefundViaRpc(
  client: SupabaseClient,
  shopifyOrderId: number,
  refund: NormalizedShopifyRefund
): Promise<SyncShopifyRefundRpcResult> {
  const { data, error } = await client.rpc("sync_shopify_refund", {
    p_shopify_order_id: shopifyOrderId,
    p_shopify_refund_id: refund.shopifyRefundId,
    p_fields: {
      note: refund.note,
      totalRefunded: refund.totalRefunded,
      totalRefundedShipping: refund.totalRefundedShipping,
      restocked: refund.restocked,
      processedAt: refund.processedAt,
      createdAtShopify: refund.createdAtShopify,
      rawData: refund.rawData,
    },
    p_line_items: refund.lineItems.map((lineItem) => ({
      orderLineItemShopifyId: lineItem.orderLineItemShopifyId,
      shopifyRefundLineItemId: lineItem.shopifyRefundLineItemId,
      quantity: lineItem.quantity,
      subtotal: lineItem.subtotal,
      totalTax: lineItem.totalTax,
      price: lineItem.price,
      restockType: lineItem.restockType,
      restocked: lineItem.restocked,
    })),
  });

  if (error) {
    throw new Error(`sync_shopify_refund RPC failed: ${error.message}`);
  }

  const row = firstRpcRow<{ id: number; applied: boolean; order_id: number }>(data);
  if (!row) {
    throw new Error("sync_shopify_refund RPC returned no row");
  }

  return { refundId: row.id, applied: row.applied, orderId: row.order_id };
}
