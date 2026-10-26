-- Phase 1, Milestone 1: Shopify order lifecycle sync -- schema and atomic
-- synchronization functions ONLY. No application code calls any of this
-- yet (that's a later milestone); this migration is additive and safe to
-- apply independently.
--
-- DO NOT APPLY TO PRODUCTION until reviewed. See the implementation plan
-- at the repo-external path referenced in the accompanying report for the
-- full design rationale (concurrency model, staleness semantics, discount
-- replacement atomicity, stub-order strategy).
--
-- Naming rule (unchanged from database/migrations/20260808_add_shopify_sales.sql,
-- extended here to new objects):
--   shopify_<thing>_id  -- an ID Shopify itself assigned (external, never
--                           a local FK).
--   <thing>_id           -- an internal FK to another table's `id` column
--                           in this database.
-- New objects in this migration are explicitly schema-qualified
-- (public.*) and new functions pin search_path = '', matching the more
-- recent security convention established in
-- database/migrations/20261011_add_online_store_portal_tokens.sql
-- onward, even though the original (2026-08) Shopify tables predate that
-- convention and are left exactly as they are.
begin;

-- =============================================================================
-- SECTION 1: New nullable columns on existing Shopify tables
-- =============================================================================

alter table public.shopify_orders
  -- GraphQL's OrderCancelReason enum has six values (confirmed against
  -- Shopify's current Admin API docs): CUSTOMER, DECLINED, FRAUD,
  -- INVENTORY, OTHER, STAFF. REST's documented set only lists five
  -- (customer, inventory, fraud, declined, other) -- normalize GraphQL's
  -- uppercase to lowercase at the adapter boundary (future milestone);
  -- 'staff' is a legitimate value here, not an unexpected one.
  add column if not exists cancel_reason text,
  -- Preserves whatever casing the source actually sent, for audit only --
  -- never used for filtering. See financial_status's own casing
  -- inconsistency, documented in CHANGELOG.md, which this column exists
  -- to help resolve in a later milestone without touching this column's
  -- sibling, financial_status, which stays the canonical, normalized one.
  add column if not exists financial_status_raw text,
  -- Best-effort counter, incremented by sync_shopify_order() only when
  -- the caller flags a touch as edit-sourced. NOT authoritative --
  -- shopify_order_line_items.removed_at is the real source of truth for
  -- "this order was edited." Never null; starts at 0.
  add column if not exists edit_count integer not null default 0,
  -- The exact incoming updated_at value sync_shopify_order() used to
  -- decide this touch was not stale, kept distinct from order_updated_at
  -- (which mirrors Shopify's own field 1:1) purely so this one column's
  -- meaning never has to change even if order_updated_at's sourcing
  -- logic ever does.
  add column if not exists last_shopify_touch_at timestamptz;

alter table public.shopify_order_line_items
  -- Set when a line item present in a prior complete snapshot is absent
  -- from a later complete snapshot (an order edit removed it). The row
  -- is NEVER deleted -- this column is the only signal of removal,
  -- preserving full history per this project's "never destructive"
  -- convention.
  add column if not exists removed_at timestamptz,
  -- Audit trail for how the removal was detected, e.g. 'orders/updated'
  -- or 'backfill' -- deliberately never 'orders/edited' until that
  -- topic's real payload shape has been captured and confirmed to carry
  -- a complete snapshot (see sync_shopify_order's p_is_complete_line_item_snapshot
  -- parameter below).
  add column if not exists removed_detected_via text;

-- =============================================================================
-- SECTION 2: New tables
-- =============================================================================

-- Named shopify_fulfillments, not fulfillments, so this is unambiguously
-- "Shopify's own fulfillment/tracking status" and never confusable with
-- Crossbar's own, separate, future internal production-tracking system.
create table if not exists public.shopify_fulfillments (
  id bigserial primary key,
  shopify_fulfillment_id bigint not null unique,
  order_id bigint not null references public.shopify_orders(id) on delete cascade,
  -- Current (non-deprecated) GraphQL FulfillmentStatus values, confirmed
  -- against Shopify's current docs: CANCELLED, ERROR, FAILURE, SUCCESS.
  -- OPEN/PENDING are deprecated -- don't expect them on new data.
  status text,
  -- The richer FulfillmentDisplayStatus (e.g. in_transit, delivered).
  display_status text,
  shipment_status text,
  -- First tracking entry's carrier, denormalized for quick display.
  tracking_company text,
  -- Arrays, not single columns: Shopify supports multiple tracking
  -- numbers per fulfillment (FulfillmentTrackingInfo is a list).
  -- Index-aligned with tracking_urls.
  tracking_numbers text[],
  tracking_urls text[],
  -- Shopify's own Location id -- external, not a local FK, hence the
  -- shopify_ prefix per this migration's naming rule (there is no local
  -- locations table).
  shopify_location_id bigint,
  total_quantity integer,
  requires_shipping boolean,
  -- Shopify's own createdAt, distinct from this row's own audit
  -- created_at column below.
  created_at_shopify timestamptz,
  -- Shopify's own updatedAt -- the column sync_shopify_fulfillment()
  -- compares against to reject a strictly-older touch of this specific
  -- fulfillment, independent of its parent order's own staleness state.
  updated_at_shopify timestamptz,
  in_transit_at timestamptz,
  delivered_at timestamptz,
  estimated_delivery_at timestamptz,
  raw_data jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Captures partial fulfillment -- which line items/quantities a given
-- fulfillment covers. Write strategy is full-replace-per-fulfillment-touch
-- (delete all rows for this fulfillment_id, reinsert the current set),
-- not a natural-key upsert: a fulfillment's line-item composition can
-- legitimately change across touches (fulfillments/update can reflect a
-- partial cancellation), and GraphQL's FulfillmentLineItem does not
-- reliably expose a stable id to upsert against in every API version.
-- The replace always runs inside the same locked transaction as its
-- parent fulfillment's own upsert (see sync_shopify_fulfillment) so a
-- failure partway never leaves a fulfillment with stale or missing line
-- items.
create table if not exists public.shopify_fulfillment_line_items (
  id bigserial primary key,
  fulfillment_id bigint not null references public.shopify_fulfillments(id) on delete cascade,
  -- Nullable, not `not null`: if this fulfillment's parent order hasn't
  -- finished syncing its own line items yet (Shopify gives no delivery
  -- ordering guarantee between an order's and its fulfillment's
  -- webhooks), the match can genuinely fail. The row is still inserted
  -- -- see shopify_line_item_id below, which preserves the raw
  -- reference regardless -- rather than silently dropping the
  -- allocation or failing the whole touch.
  order_line_item_id bigint references public.shopify_order_line_items(id) on delete cascade,
  -- The raw Shopify line item id this allocation is about, preserved
  -- even when order_line_item_id above couldn't be resolved yet.
  -- reconcile_shopify_order_line_item_references() (called automatically
  -- from sync_shopify_order() every time that order's line items are
  -- written) resolves order_line_item_id against this column the moment
  -- a matching shopify_order_line_items row first appears -- no
  -- separate backfill pass is needed.
  shopify_line_item_id bigint,
  shopify_fulfillment_line_item_id bigint,
  quantity integer not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.shopify_refunds (
  id bigserial primary key,
  shopify_refund_id bigint not null unique,
  order_id bigint not null references public.shopify_orders(id) on delete cascade,
  note text,
  total_refunded numeric(10,2),
  total_refunded_shipping numeric(10,2),
  restocked boolean,
  processed_at timestamptz,
  created_at_shopify timestamptz,
  raw_data jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Write strategy: full-replace-per-refund-touch, deliberately NOT a
-- composite-unique-key upsert. Shopify's RefundLineItem.id field is
-- confirmed nullable in the current GraphQL schema (added only in API
-- version 2024-07), so it cannot be relied on as a sole key -- and
-- rather than invent a composite key and risk collapsing two legitimate
-- entries that reference the same original line item, every entry the
-- refund payload reports gets its own row, unconditionally, every time
-- this refund is touched. sequence_in_refund is purely descriptive
-- (preserves display order), never a uniqueness mechanism. Since a
-- refund is confirmed immutable once created in Shopify's model (no
-- updatedAt field exists on Refund), "replace" and "insert-once" are
-- operationally identical in practice.
create table if not exists public.shopify_refund_line_items (
  id bigserial primary key,
  refund_id bigint not null references public.shopify_refunds(id) on delete cascade,
  -- Nullable for the same stub-order-race reason as
  -- shopify_fulfillment_line_items.order_line_item_id above, and
  -- resolved by the same reconcile_shopify_order_line_item_references()
  -- call once this order's line items exist.
  order_line_item_id bigint references public.shopify_order_line_items(id) on delete cascade,
  shopify_line_item_id bigint,
  shopify_refund_line_item_id bigint,
  sequence_in_refund integer not null,
  quantity integer not null,
  subtotal numeric(10,2),
  total_tax numeric(10,2),
  price numeric(10,2),
  restock_type text,
  restocked boolean not null default false,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Discount applications/allocations have NO stable Shopify id -- GraphQL's
-- DiscountApplication interface exposes only `index` (ordinal position
-- within that order's discount list AT THE TIME OF FETCH, not a
-- permanent id) plus, for code-based discounts, `code`. Write strategy
-- is therefore full-replace-per-order-touch under the composite key
-- (order_id, application_index): on every non-stale order touch that
-- includes discount data, delete the existing set for that order_id and
-- reinsert the current one, inside the SAME transaction as the rest of
-- the order write (sync_shopify_order) -- never as two separate calls --
-- so a failure partway rolls back the delete too, by ordinary Postgres
-- transactional semantics. `index` shifting across time (e.g. a removed
-- discount changes later indexes) is exactly why individual rows are
-- never matched/upserted across touches.
create table if not exists public.shopify_order_discounts (
  id bigserial primary key,
  order_id bigint not null references public.shopify_orders(id) on delete cascade,
  application_index integer not null,
  -- One of the four confirmed DiscountApplication implementing types:
  -- automatic | discount_code | manual | script.
  application_type text not null,
  -- Only populated for application_type = 'discount_code'.
  code text,
  title text,
  -- percentage | fixed_amount, derived from which of PricingPercentageValue
  -- / MoneyV2 the discount's value resolves to.
  value_type text,
  value_percentage numeric(5,2),
  value_amount numeric(10,2),
  -- line_item | shipping_line (DiscountApplicationTargetType).
  target_type text,
  -- Confirmed current values: ALL, ENTITLED, EXPLICIT.
  target_selection text,
  -- Confirmed current values: ACROSS, EACH. ONE is deprecated.
  allocation_method text,
  -- Best-effort derived flag -- Shopify exposes no dedicated boolean for
  -- "this is a free-shipping discount". Derivation (target_type =
  -- 'shipping_line' and the discount's value covers the shipping line's
  -- pre-discount price) must be verified against a real free-shipping
  -- test order before being trusted; default false until confirmed.
  is_free_shipping boolean not null default false,
  raw_data jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique (order_id, application_index)
);

create table if not exists public.shopify_order_discount_allocations (
  id bigserial primary key,
  order_discount_id bigint not null references public.shopify_order_discounts(id) on delete cascade,
  -- Null when the allocation targets the shipping line rather than a
  -- product line item (ShippingLine.discountAllocations is confirmed to
  -- exist as its own connection, distinct from LineItem.discountAllocations).
  order_line_item_id bigint references public.shopify_order_line_items(id) on delete cascade,
  is_shipping_line_allocation boolean not null default false,
  allocated_amount numeric(10,2) not null,
  raw_data jsonb,
  created_at timestamp default now()
);

-- Backfill/enrichment checkpoint. One row per named job. See
-- claim_shopify_sync_checkpoint() below for the concurrency-safe claim
-- mechanism -- this table is never written to directly by application
-- code outside that function.
create table if not exists public.shopify_sync_checkpoints (
  id bigserial primary key,
  job_name text not null unique,
  pagination_cursor text,
  last_processed_shopify_order_id bigint,
  last_processed_created_at timestamptz,
  orders_processed_count integer not null default 0,
  status text not null default 'in_progress',
  error_message text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  -- A hash/rendering of the run's effective query parameters (date
  -- range, limit, and the query's own field-selection version). A
  -- --resume whose fingerprint doesn't match the stored one is refused
  -- rather than silently resumed against a cursor issued for a
  -- different query shape.
  params_fingerprint text,
  -- Concurrency-safe claim lease, mirroring the existing stale-lease
  -- self-heals pattern already used for shopify_webhook_events.
  locked_by text,
  locked_at timestamptz
);

-- =============================================================================
-- SECTION 3: RLS -- identical posture to every existing Shopify table.
-- Enabled, zero policies, no anon/authenticated grants. Only
-- supabaseAdmin (service-role, bypasses RLS) or the functions below
-- (security invoker, called by service-role) ever touch these tables.
-- =============================================================================

alter table public.shopify_fulfillments enable row level security;
alter table public.shopify_fulfillment_line_items enable row level security;
alter table public.shopify_refunds enable row level security;
alter table public.shopify_refund_line_items enable row level security;
alter table public.shopify_order_discounts enable row level security;
alter table public.shopify_order_discount_allocations enable row level security;
alter table public.shopify_sync_checkpoints enable row level security;

-- =============================================================================
-- SECTION 4: Indexes
-- =============================================================================

create index if not exists idx_shopify_fulfillments_order on public.shopify_fulfillments(order_id);
create index if not exists idx_shopify_fulfillment_line_items_fulfillment on public.shopify_fulfillment_line_items(fulfillment_id);
create index if not exists idx_shopify_fulfillment_line_items_order_line_item on public.shopify_fulfillment_line_items(order_line_item_id);
create index if not exists idx_shopify_refunds_order on public.shopify_refunds(order_id);
create index if not exists idx_shopify_refund_line_items_refund on public.shopify_refund_line_items(refund_id);
create index if not exists idx_shopify_refund_line_items_order_line_item on public.shopify_refund_line_items(order_line_item_id);
create index if not exists idx_shopify_order_discounts_order on public.shopify_order_discounts(order_id);
create index if not exists idx_shopify_order_discount_allocations_discount on public.shopify_order_discount_allocations(order_discount_id);
create index if not exists idx_shopify_order_discount_allocations_line_item on public.shopify_order_discount_allocations(order_line_item_id);
create index if not exists idx_shopify_sync_checkpoints_job_name on public.shopify_sync_checkpoints(job_name);
create index if not exists idx_shopify_orders_cancel_reason on public.shopify_orders(cancel_reason);

-- Partial indexes supporting reconcile_shopify_order_line_item_references():
-- small by construction (only rows still awaiting resolution), and
-- exactly the lookup shape that function's UPDATE...FROM performs on
-- every order touch that has line items.
create index if not exists idx_shopify_fulfillment_line_items_unresolved on public.shopify_fulfillment_line_items(shopify_line_item_id) where order_line_item_id is null;
create index if not exists idx_shopify_refund_line_items_unresolved on public.shopify_refund_line_items(shopify_line_item_id) where order_line_item_id is null;

-- =============================================================================
-- SECTION 5: Atomic synchronization functions
-- =============================================================================
--
-- JSON CONTRACT (for the future TypeScript caller, not built in this
-- milestone): every object below uses camelCase keys matching this
-- project's existing NormalizedShopify* interface naming
-- (lib/shopifyNormalized.ts).
--
-- CRITICAL: key PRESENCE, not just value, is meaningful throughout.
-- A key whose value is JSON null means "Shopify reports this field as
-- empty/cleared -- overwrite the stored value with null." A key that is
-- ABSENT from the object entirely means "this touch has no opinion about
-- this field -- never overwrite whatever is already stored." This is
-- what lets the (not-yet-built) enrichment pass safely re-sync only the
-- new fields (fulfillments/refunds/discounts/cancel_reason/financial_
-- status_raw) on an already-imported order without blanking out
-- everything else it didn't re-fetch (shipping/billing address, etc.).
-- A live webhook or the existing backfill, which always has the
-- complete order object, should always include every key (using null
-- where Shopify's own payload says null) to preserve today's
-- full-overwrite behavior exactly.
--
-- p_order_fields keys -> shopify_orders columns:
--   orderNumber, email, phone, financialStatus, financialStatusRaw,
--   fulfillmentStatus, currency, subtotalPrice, totalTax, totalDiscounts,
--   totalShipping, totalRefunded, totalPrice, customerNote,
--   shippingMethod, shippingAddress, billingAddress, sourceName,
--   landingSite, referringSite, createdAt, updatedAt, cancelledAt,
--   cancelReason, rawData.
-- `updatedAt` is required (not subject to the presence rule above) --
-- it's the value the staleness check itself compares against.
--
-- p_customer: {shopifyCustomerId, email, firstName, lastName, phone,
--   acceptsMarketing, ordersCount, totalSpent, rawData} or SQL null if
--   this touch has no customer info at all.
--
-- p_line_items: array of {shopifyLineItemId, shopifyProductId,
--   shopifyVariantId, onlineStoreId, vendor, teamTag, itemNumber,
--   isCrossbarAddon, title, variantTitle, sku, color, size, quantity,
--   currentQuantity, price, totalDiscount, requiresShipping, taxable,
--   fulfillmentStatus, properties, propertiesText, rawData} -- note
--   onlineStoreId/teamTag/itemNumber/isCrossbarAddon/color/size are
--   already-resolved (via the existing matchLineItemsToStores/
--   parseVendor/parseVariantTitle helpers in lib/shopifyNormalized.ts),
--   not raw Shopify fields -- the caller resolves these in TypeScript
--   exactly as upsertLineItems() does today, then passes the resolved
--   values through. SQL null (not an empty array) means "this touch
--   carries no line-item list at all" (e.g. a fulfillments/refunds
--   event, which never includes order line items).
--
-- p_is_complete_line_item_snapshot: true only when p_line_items is
--   confirmed to be the order's FULL current line-item list (true for
--   orders/create, orders/updated, backfill, and enrichment fetches --
--   NOT true for orders/edited until its real payload shape has been
--   captured and confirmed). Gates whether the removed-item diff runs.
--
-- p_discounts: array of {applicationIndex, applicationType, code,
--   title, valueType, valuePercentage, valueAmount, targetType,
--   targetSelection, allocationMethod, isFreeShipping, rawData,
--   allocations: [{orderLineItemShopifyId, isShippingLineAllocation,
--   allocatedAmount, rawData}]} -- SQL null means "no opinion, don't
--   touch existing discount rows"; an empty JSON array '[]' means "this
--   order has confirmed zero discounts right now, clear existing rows."
--
-- p_is_edit_event: true only for a touch sourced from orders/edited
--   (increments the best-effort edit_count counter; does not affect any
--   other behavior).

-- Atomic, concurrency-safe customer upsert -- a true INSERT ... ON
-- CONFLICT DO UPDATE (one statement, race-free for concurrent first-time
-- inserts of the same shopify_customer_id), replacing the previous
-- select-then-branch approach. first_seen_at is deliberately absent from
-- the DO UPDATE's SET list -- omitting it from SET is what makes it
-- "set once on insert, never overwritten on conflict," with no risk of
-- a second concurrent insert attempt ever surfacing an unhandled unique-
-- violation error the way two independent select-then-insert calls could.
create or replace function public.upsert_shopify_customer(p_customer jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_customer is null then
    return null;
  end if;

  insert into public.shopify_customers as c (
    shopify_customer_id, email, first_name, last_name, phone,
    accepts_marketing, orders_count, total_spent, raw_data,
    first_seen_at, last_synced_at
  )
  values (
    (p_customer->>'shopifyCustomerId')::bigint,
    p_customer->>'email',
    p_customer->>'firstName',
    p_customer->>'lastName',
    p_customer->>'phone',
    (p_customer->>'acceptsMarketing')::boolean,
    (p_customer->>'ordersCount')::integer,
    (p_customer->>'totalSpent')::numeric,
    p_customer->'rawData',
    now(),
    now()
  )
  on conflict (shopify_customer_id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    phone = excluded.phone,
    accepts_marketing = excluded.accepts_marketing,
    orders_count = excluded.orders_count,
    total_spent = excluded.total_spent,
    raw_data = excluded.raw_data,
    last_synced_at = now()
  returning c.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_shopify_customer(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_shopify_customer(jsonb) to service_role;

-- Resolves any PREVIOUSLY-unresolved shopify_fulfillment_line_items/
-- shopify_refund_line_items rows for this order -- rows where a
-- fulfillment or refund event arrived before the order's own line
-- items existed (see sync_shopify_fulfillment/sync_shopify_refund's
-- stub-order handling), which were therefore inserted with
-- order_line_item_id = NULL but shopify_line_item_id preserved. Called
-- from sync_shopify_order() immediately after it upserts this order's
-- line items -- i.e. exactly the moment a previously-missing line item
-- first becomes available to link against. Matches purely on
-- shopify_line_item_id (globally unique) scoped to this order_id, so it
-- is always safe to call -- a touch with nothing to reconcile simply
-- updates zero rows. Idempotent and safe to call repeatedly: once a row
-- is resolved (order_line_item_id is no longer null), the `is null`
-- guard means it is never touched again by this function.
create or replace function public.reconcile_shopify_order_line_item_references(p_order_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.shopify_fulfillment_line_items fli
  set order_line_item_id = li.id
  from public.shopify_order_line_items li
  where fli.order_line_item_id is null
    and fli.shopify_line_item_id is not null
    and li.order_id = p_order_id
    and li.shopify_line_item_id = fli.shopify_line_item_id;

  update public.shopify_refund_line_items rli
  set order_line_item_id = li.id
  from public.shopify_order_line_items li
  where rli.order_line_item_id is null
    and rli.shopify_line_item_id is not null
    and li.order_id = p_order_id
    and li.shopify_line_item_id = rli.shopify_line_item_id;
end;
$$;

revoke all on function public.reconcile_shopify_order_line_item_references(bigint) from public, anon, authenticated;
grant execute on function public.reconcile_shopify_order_line_item_references(bigint) to service_role;

-- The single write path for one orders/create|updated|cancelled|edited
-- touch. See the JSON CONTRACT comment above for parameter shapes, and
-- the migration's header comment for the full design rationale.
create or replace function public.sync_shopify_order(
  p_shopify_order_id bigint,
  p_customer jsonb,
  p_order_fields jsonb,
  p_line_items jsonb,
  p_is_complete_line_item_snapshot boolean,
  p_discounts jsonb,
  p_source text,
  p_is_edit_event boolean default false
)
returns table (id bigint, applied boolean, is_new boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id bigint;
  v_order_id bigint;
  v_existing_id bigint;
  v_existing_updated_at timestamptz;
  v_incoming_updated_at timestamptz;
  v_is_new boolean;
  v_discount jsonb;
  v_discount_id bigint;
begin
  if p_source is null or p_shopify_order_id is null then
    raise exception 'sync_shopify_order: p_shopify_order_id and p_source are required';
  end if;

  -- Serializes every writer (order touches, fulfillment touches, refund
  -- touches -- see sync_shopify_fulfillment/sync_shopify_refund below,
  -- which take the identical lock) touching this exact shopify_order_id.
  -- Different orders never contend. Transaction-scoped: released
  -- automatically on commit or rollback, never explicitly unlocked.
  perform pg_advisory_xact_lock(hashtextextended('shopify_order:' || p_shopify_order_id::text, 0));

  v_customer_id := public.upsert_shopify_customer(p_customer);

  select so.id, so.order_updated_at into v_existing_id, v_existing_updated_at
  from public.shopify_orders so
  where so.shopify_order_id = p_shopify_order_id;

  v_is_new := v_existing_id is null;
  v_incoming_updated_at := (p_order_fields->>'updatedAt')::timestamptz;

  -- STALE: strictly older than what's already stored. Note this is `<`,
  -- not `<=` -- an equal timestamp is treated as "same known state,
  -- safe to reconcile," which is exactly what lets the (not yet built)
  -- enrichment pass populate fulfillments/refunds/discounts/corrected
  -- casing on a historical order whose Shopify updatedAt hasn't moved
  -- since its original import. Only a genuinely older delivery is
  -- rejected -- see the migration header and the plan document for the
  -- full reasoning and the accepted same-timestamp-different-content
  -- edge case.
  if v_existing_id is not null
     and v_existing_updated_at is not null
     and v_incoming_updated_at is not null
     and v_incoming_updated_at < v_existing_updated_at then
    return query select v_existing_id, false, false;
    return;
  end if;

  -- Field-by-field: `p_order_fields ? 'key'` checks KEY PRESENCE, not
  -- value truthiness -- a present-but-null value still overwrites
  -- (Shopify explicitly cleared the field); an ABSENT key preserves
  -- whatever is already stored. See the JSON CONTRACT comment above.
  insert into public.shopify_orders as so (
    shopify_order_id, order_number, customer_id, email, phone,
    financial_status, financial_status_raw, fulfillment_status,
    currency, subtotal_price, total_tax, total_discounts,
    total_shipping, total_refunded, total_price, customer_note,
    shipping_method, shipping_address, billing_address, source_name,
    landing_site, referring_site, order_created_at, order_updated_at,
    cancelled_at, cancel_reason, last_shopify_touch_at, raw_data, source
  )
  values (
    p_shopify_order_id,
    p_order_fields->>'orderNumber',
    v_customer_id,
    p_order_fields->>'email',
    p_order_fields->>'phone',
    p_order_fields->>'financialStatus',
    p_order_fields->>'financialStatusRaw',
    p_order_fields->>'fulfillmentStatus',
    p_order_fields->>'currency',
    (p_order_fields->>'subtotalPrice')::numeric,
    (p_order_fields->>'totalTax')::numeric,
    (p_order_fields->>'totalDiscounts')::numeric,
    (p_order_fields->>'totalShipping')::numeric,
    (p_order_fields->>'totalRefunded')::numeric,
    (p_order_fields->>'totalPrice')::numeric,
    p_order_fields->>'customerNote',
    p_order_fields->>'shippingMethod',
    p_order_fields->'shippingAddress',
    p_order_fields->'billingAddress',
    p_order_fields->>'sourceName',
    p_order_fields->>'landingSite',
    p_order_fields->>'referringSite',
    (p_order_fields->>'createdAt')::timestamptz,
    v_incoming_updated_at,
    (p_order_fields->>'cancelledAt')::timestamptz,
    p_order_fields->>'cancelReason',
    v_incoming_updated_at,
    p_order_fields->'rawData',
    p_source
  )
  on conflict (shopify_order_id) do update set
    order_number       = case when p_order_fields ? 'orderNumber'       then excluded.order_number       else so.order_number       end,
    customer_id         = coalesce(v_customer_id, so.customer_id),
    email               = case when p_order_fields ? 'email'            then excluded.email               else so.email               end,
    phone               = case when p_order_fields ? 'phone'            then excluded.phone               else so.phone               end,
    financial_status    = case when p_order_fields ? 'financialStatus' then excluded.financial_status    else so.financial_status    end,
    financial_status_raw= case when p_order_fields ? 'financialStatusRaw' then excluded.financial_status_raw else so.financial_status_raw end,
    fulfillment_status  = case when p_order_fields ? 'fulfillmentStatus' then excluded.fulfillment_status else so.fulfillment_status  end,
    currency            = case when p_order_fields ? 'currency'         then excluded.currency            else so.currency            end,
    subtotal_price      = case when p_order_fields ? 'subtotalPrice'    then excluded.subtotal_price      else so.subtotal_price      end,
    total_tax           = case when p_order_fields ? 'totalTax'        then excluded.total_tax           else so.total_tax           end,
    total_discounts     = case when p_order_fields ? 'totalDiscounts'  then excluded.total_discounts     else so.total_discounts     end,
    total_shipping      = case when p_order_fields ? 'totalShipping'   then excluded.total_shipping      else so.total_shipping      end,
    total_refunded      = case when p_order_fields ? 'totalRefunded'   then excluded.total_refunded      else so.total_refunded      end,
    total_price         = case when p_order_fields ? 'totalPrice'      then excluded.total_price         else so.total_price         end,
    customer_note       = case when p_order_fields ? 'customerNote'    then excluded.customer_note       else so.customer_note       end,
    shipping_method     = case when p_order_fields ? 'shippingMethod'  then excluded.shipping_method     else so.shipping_method     end,
    shipping_address    = case when p_order_fields ? 'shippingAddress' then excluded.shipping_address    else so.shipping_address    end,
    billing_address     = case when p_order_fields ? 'billingAddress'  then excluded.billing_address     else so.billing_address     end,
    source_name         = case when p_order_fields ? 'sourceName'      then excluded.source_name         else so.source_name         end,
    landing_site        = case when p_order_fields ? 'landingSite'     then excluded.landing_site        else so.landing_site        end,
    referring_site      = case when p_order_fields ? 'referringSite'   then excluded.referring_site      else so.referring_site      end,
    order_created_at    = case when p_order_fields ? 'createdAt'       then excluded.order_created_at    else so.order_created_at    end,
    order_updated_at    = excluded.order_updated_at, -- always present; drives the staleness check itself
    cancelled_at         = case when p_order_fields ? 'cancelledAt'     then excluded.cancelled_at        else so.cancelled_at        end,
    cancel_reason        = case when p_order_fields ? 'cancelReason'    then excluded.cancel_reason       else so.cancel_reason       end,
    last_shopify_touch_at = excluded.last_shopify_touch_at,
    raw_data             = case when p_order_fields ? 'rawData'         then excluded.raw_data            else so.raw_data            end
    -- source and edit_count deliberately omitted from SET: source is
    -- set once on insert and never overwritten (mirrors
    -- shopify_customers.first_seen_at); edit_count is bumped separately
    -- below, only for an edit-sourced touch.
  returning so.id into v_order_id;

  if p_is_edit_event then
    update public.shopify_orders set edit_count = edit_count + 1 where id = v_order_id;
  end if;

  -- Line items: only touched when this call actually carries a line-item
  -- list (fulfillments/refunds events never do -- they call a different
  -- function entirely and never reach this branch).
  if p_line_items is not null then
    insert into public.shopify_order_line_items as li (
      order_id, shopify_line_item_id, shopify_product_id, shopify_variant_id,
      online_store_id, vendor, team_tag, item_number, is_crossbar_addon,
      title, variant_title, sku, color, size, quantity, current_quantity,
      price, total_discount, requires_shipping, taxable, fulfillment_status,
      properties, properties_text, raw_data
    )
    select
      v_order_id,
      (item->>'shopifyLineItemId')::bigint,
      (item->>'shopifyProductId')::bigint,
      (item->>'shopifyVariantId')::bigint,
      (item->>'onlineStoreId')::bigint,
      item->>'vendor',
      item->>'teamTag',
      item->>'itemNumber',
      coalesce((item->>'isCrossbarAddon')::boolean, false),
      item->>'title',
      item->>'variantTitle',
      item->>'sku',
      item->>'color',
      item->>'size',
      coalesce((item->>'quantity')::integer, 1),
      (item->>'currentQuantity')::integer,
      (item->>'price')::numeric,
      (item->>'totalDiscount')::numeric,
      (item->>'requiresShipping')::boolean,
      (item->>'taxable')::boolean,
      item->>'fulfillmentStatus',
      item->'properties',
      item->>'propertiesText',
      item->'rawData'
    from jsonb_array_elements(p_line_items) as item
    on conflict (shopify_line_item_id) do update set
      order_id             = excluded.order_id,
      shopify_product_id   = excluded.shopify_product_id,
      shopify_variant_id    = excluded.shopify_variant_id,
      online_store_id       = excluded.online_store_id,
      vendor                = excluded.vendor,
      team_tag              = excluded.team_tag,
      item_number           = excluded.item_number,
      is_crossbar_addon     = excluded.is_crossbar_addon,
      title                 = excluded.title,
      variant_title         = excluded.variant_title,
      sku                   = excluded.sku,
      color                 = excluded.color,
      size                  = excluded.size,
      quantity              = excluded.quantity,
      current_quantity      = excluded.current_quantity,
      price                 = excluded.price,
      total_discount        = excluded.total_discount,
      requires_shipping     = excluded.requires_shipping,
      taxable               = excluded.taxable,
      fulfillment_status    = excluded.fulfillment_status,
      properties            = excluded.properties,
      properties_text       = excluded.properties_text,
      raw_data              = excluded.raw_data,
      -- A line item reappearing in a later complete snapshot is no
      -- longer "removed" -- clear any prior removal marker.
      removed_at            = null,
      removed_detected_via  = null;

    -- The line items this order carries have just been written -- this
    -- is exactly the moment any previously-unresolved fulfillment/refund
    -- line-item reference (one that arrived before this order's line
    -- items existed) can finally be linked up. Runs regardless of
    -- p_is_complete_line_item_snapshot -- reconciliation only cares that
    -- a shopify_order_line_items row now exists, not whether this touch
    -- was a complete snapshot.
    perform public.reconcile_shopify_order_line_item_references(v_order_id);

    if p_is_complete_line_item_snapshot then
      -- Defensive `is not null` filter on the subquery: NOT IN against a
      -- set containing even one NULL makes the whole comparison NULL
      -- (never true) for every row, which would silently disable
      -- removal-detection entirely if a malformed item ever lacked an
      -- id. Filtering NULLs out of the subquery keeps the comparison
      -- well-defined regardless.
      update public.shopify_order_line_items
      set removed_at = now(), removed_detected_via = p_source
      where order_id = v_order_id
        and removed_at is null
        and shopify_line_item_id not in (
          select (item->>'shopifyLineItemId')::bigint
          from jsonb_array_elements(p_line_items) as item
          where item->>'shopifyLineItemId' is not null
        );
    end if;
  end if;

  -- Discounts: SQL null ("no opinion") vs. an explicit '[]' ("confirmed
  -- empty, clear existing rows") vs. a populated array are all
  -- distinguished here -- see the JSON CONTRACT comment above. The
  -- delete and every insert below run in this same transaction, so a
  -- failure partway (e.g. a malformed row) rolls back the delete too;
  -- existing discount data is never left partially removed.
  if p_discounts is not null then
    delete from public.shopify_order_discounts where order_id = v_order_id;

    for v_discount in select * from jsonb_array_elements(p_discounts) loop
      insert into public.shopify_order_discounts as od (
        order_id, application_index, application_type, code, title,
        value_type, value_percentage, value_amount, target_type,
        target_selection, allocation_method, is_free_shipping, raw_data
      )
      values (
        v_order_id,
        (v_discount->>'applicationIndex')::integer,
        v_discount->>'applicationType',
        v_discount->>'code',
        v_discount->>'title',
        v_discount->>'valueType',
        (v_discount->>'valuePercentage')::numeric,
        (v_discount->>'valueAmount')::numeric,
        v_discount->>'targetType',
        v_discount->>'targetSelection',
        v_discount->>'allocationMethod',
        coalesce((v_discount->>'isFreeShipping')::boolean, false),
        v_discount->'rawData'
      )
      returning od.id into v_discount_id;

      insert into public.shopify_order_discount_allocations (
        order_discount_id, order_line_item_id, is_shipping_line_allocation,
        allocated_amount, raw_data
      )
      select
        v_discount_id,
        oli.id,
        coalesce((alloc->>'isShippingLineAllocation')::boolean, false),
        (alloc->>'allocatedAmount')::numeric,
        alloc->'rawData'
      from jsonb_array_elements(coalesce(v_discount->'allocations', '[]'::jsonb)) as alloc
      left join public.shopify_order_line_items oli
        on oli.shopify_line_item_id = (alloc->>'orderLineItemShopifyId')::bigint;
    end loop;
  end if;

  return query select v_order_id, true, v_is_new;
end;
$$;

revoke all on function public.sync_shopify_order(bigint, jsonb, jsonb, jsonb, boolean, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.sync_shopify_order(bigint, jsonb, jsonb, jsonb, boolean, jsonb, text, boolean) to service_role;

-- One fulfillments/create|update touch. Independently acquires the SAME
-- per-order advisory lock as sync_shopify_order (keyed by the
-- fulfillment's own parent shopify_order_id), so it is always serialized
-- against a concurrently-processing order-level touch for the same
-- order, or another fulfillment event for the same order -- never
-- against fulfillments for a DIFFERENT order, which proceed with zero
-- contention.
create or replace function public.sync_shopify_fulfillment(
  p_shopify_order_id bigint,
  p_shopify_fulfillment_id bigint,
  p_fields jsonb,
  p_line_items jsonb
)
returns table (id bigint, applied boolean, order_id bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id bigint;
  v_fulfillment_id bigint;
  v_existing_updated_at timestamptz;
  v_incoming_updated_at timestamptz;
begin
  if p_shopify_order_id is null or p_shopify_fulfillment_id is null then
    raise exception 'sync_shopify_fulfillment: p_shopify_order_id and p_shopify_fulfillment_id are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('shopify_order:' || p_shopify_order_id::text, 0));

  select so.id into v_order_id from public.shopify_orders so
  where so.shopify_order_id = p_shopify_order_id;

  -- Shopify gives no delivery-ordering guarantee between an order's own
  -- webhooks and its fulfillment's -- confirmed against Shopify's
  -- current webhook documentation, which gives exactly this kind of
  -- cross-topic-for-the-same-resource example. A minimal stub row (every
  -- column but shopify_order_id/source left null, critically including
  -- order_updated_at) lets the fulfillment's FK be satisfied regardless
  -- of arrival order -- the stub's null order_updated_at always loses
  -- the `<` staleness comparison in sync_shopify_order whenever the real
  -- order payload eventually arrives, so it always fully overwrites the
  -- stub, in whichever order the two events actually arrive.
  if v_order_id is null then
    -- Explicitly qualified (shopify_orders.id, not bare `id`): this
    -- function RETURNS TABLE(id, applied, order_id), which implicitly
    -- declares `id` as an OUT-parameter variable in scope for the whole
    -- function body -- an unqualified `returning id` is ambiguous
    -- between that variable and the shopify_orders.id column (error
    -- 42702), caught when testing against a real database.
    insert into public.shopify_orders as so2 (shopify_order_id, source)
    values (p_shopify_order_id, 'fulfillment_webhook_stub')
    returning so2.id into v_order_id;
  end if;

  v_incoming_updated_at := (p_fields->>'updatedAtShopify')::timestamptz;

  select sf.updated_at_shopify into v_existing_updated_at
  from public.shopify_fulfillments sf
  where sf.shopify_fulfillment_id = p_shopify_fulfillment_id;

  if v_existing_updated_at is not null
     and v_incoming_updated_at is not null
     and v_incoming_updated_at < v_existing_updated_at then
    select sf.id into v_fulfillment_id from public.shopify_fulfillments sf
    where sf.shopify_fulfillment_id = p_shopify_fulfillment_id;
    return query select v_fulfillment_id, false, v_order_id;
    return;
  end if;

  insert into public.shopify_fulfillments as sf (
    shopify_fulfillment_id, order_id, status, display_status, shipment_status,
    tracking_company, tracking_numbers, tracking_urls, shopify_location_id,
    total_quantity, requires_shipping, created_at_shopify, updated_at_shopify,
    in_transit_at, delivered_at, estimated_delivery_at, raw_data
  )
  values (
    p_shopify_fulfillment_id, v_order_id,
    p_fields->>'status', p_fields->>'displayStatus', p_fields->>'shipmentStatus',
    p_fields->>'trackingCompany',
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_fields->'trackingNumbers', '[]'::jsonb)) x),
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_fields->'trackingUrls', '[]'::jsonb)) x),
    (p_fields->>'shopifyLocationId')::bigint,
    (p_fields->>'totalQuantity')::integer,
    (p_fields->>'requiresShipping')::boolean,
    (p_fields->>'createdAtShopify')::timestamptz,
    v_incoming_updated_at,
    (p_fields->>'inTransitAt')::timestamptz,
    (p_fields->>'deliveredAt')::timestamptz,
    (p_fields->>'estimatedDeliveryAt')::timestamptz,
    p_fields->'rawData'
  )
  on conflict (shopify_fulfillment_id) do update set
    order_id              = excluded.order_id,
    status                = excluded.status,
    display_status        = excluded.display_status,
    shipment_status        = excluded.shipment_status,
    tracking_company       = excluded.tracking_company,
    tracking_numbers       = excluded.tracking_numbers,
    tracking_urls          = excluded.tracking_urls,
    shopify_location_id    = excluded.shopify_location_id,
    total_quantity         = excluded.total_quantity,
    requires_shipping      = excluded.requires_shipping,
    created_at_shopify     = excluded.created_at_shopify,
    updated_at_shopify     = excluded.updated_at_shopify,
    in_transit_at          = excluded.in_transit_at,
    delivered_at           = excluded.delivered_at,
    estimated_delivery_at  = excluded.estimated_delivery_at,
    raw_data               = excluded.raw_data
  returning sf.id into v_fulfillment_id;

  -- Full-replace, inside this same transaction -- see the table comment
  -- on shopify_fulfillment_line_items for why.
  if p_line_items is not null then
    delete from public.shopify_fulfillment_line_items where fulfillment_id = v_fulfillment_id;

    insert into public.shopify_fulfillment_line_items (
      fulfillment_id, order_line_item_id, shopify_line_item_id,
      shopify_fulfillment_line_item_id, quantity
    )
    select
      v_fulfillment_id,
      oli.id,
      (item->>'orderLineItemShopifyId')::bigint,
      (item->>'shopifyFulfillmentLineItemId')::bigint,
      (item->>'quantity')::integer
    from jsonb_array_elements(p_line_items) as item
    left join public.shopify_order_line_items oli
      on oli.shopify_line_item_id = (item->>'orderLineItemShopifyId')::bigint;
  end if;

  return query select v_fulfillment_id, true, v_order_id;
end;
$$;

revoke all on function public.sync_shopify_fulfillment(bigint, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_shopify_fulfillment(bigint, bigint, jsonb, jsonb) to service_role;

-- One refunds/create touch. Same per-order advisory lock and stub-order
-- strategy as sync_shopify_fulfillment. No staleness comparison on the
-- parent shopify_refunds row -- Refund is confirmed immutable once
-- created in Shopify's model (no updatedAt field), so a plain natural-key
-- upsert is sufficient and safe; re-processing the identical refund
-- (webhook retry) converges to the same row.
create or replace function public.sync_shopify_refund(
  p_shopify_order_id bigint,
  p_shopify_refund_id bigint,
  p_fields jsonb,
  p_line_items jsonb
)
returns table (id bigint, applied boolean, order_id bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id bigint;
  v_refund_id bigint;
begin
  if p_shopify_order_id is null or p_shopify_refund_id is null then
    raise exception 'sync_shopify_refund: p_shopify_order_id and p_shopify_refund_id are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('shopify_order:' || p_shopify_order_id::text, 0));

  select so.id into v_order_id from public.shopify_orders so
  where so.shopify_order_id = p_shopify_order_id;

  if v_order_id is null then
    -- Same ambiguity fix as sync_shopify_fulfillment above -- this
    -- function also RETURNS TABLE(id, applied, order_id), so `id` is an
    -- in-scope OUT-parameter variable and the RETURNING clause must be
    -- explicitly qualified against the table, not left bare.
    insert into public.shopify_orders as so2 (shopify_order_id, source)
    values (p_shopify_order_id, 'refund_webhook_stub')
    returning so2.id into v_order_id;
  end if;

  insert into public.shopify_refunds as sr (
    shopify_refund_id, order_id, note, total_refunded, total_refunded_shipping,
    restocked, processed_at, created_at_shopify, raw_data
  )
  values (
    p_shopify_refund_id, v_order_id,
    p_fields->>'note',
    (p_fields->>'totalRefunded')::numeric,
    (p_fields->>'totalRefundedShipping')::numeric,
    (p_fields->>'restocked')::boolean,
    (p_fields->>'processedAt')::timestamptz,
    (p_fields->>'createdAtShopify')::timestamptz,
    p_fields->'rawData'
  )
  on conflict (shopify_refund_id) do update set
    order_id           = excluded.order_id,
    note               = excluded.note,
    total_refunded     = excluded.total_refunded,
    total_refunded_shipping = excluded.total_refunded_shipping,
    restocked          = excluded.restocked,
    processed_at       = excluded.processed_at,
    created_at_shopify = excluded.created_at_shopify,
    raw_data           = excluded.raw_data
  returning sr.id into v_refund_id;

  -- Full-replace, inside this same transaction -- see the table comment
  -- on shopify_refund_line_items: every entry Shopify reports gets its
  -- own row, unconditionally, never collapsed against another entry
  -- that happens to reference the same original line item.
  if p_line_items is not null then
    delete from public.shopify_refund_line_items where refund_id = v_refund_id;

    insert into public.shopify_refund_line_items (
      refund_id, order_line_item_id, shopify_line_item_id,
      shopify_refund_line_item_id, sequence_in_refund, quantity,
      subtotal, total_tax, price, restock_type, restocked
    )
    select
      v_refund_id,
      oli.id,
      (t.item->>'orderLineItemShopifyId')::bigint,
      (t.item->>'shopifyRefundLineItemId')::bigint,
      (t.seq - 1)::integer,
      (t.item->>'quantity')::integer,
      (t.item->>'subtotal')::numeric,
      (t.item->>'totalTax')::numeric,
      (t.item->>'price')::numeric,
      t.item->>'restockType',
      coalesce((t.item->>'restocked')::boolean, false)
    from jsonb_array_elements(p_line_items) with ordinality as t(item, seq)
    left join public.shopify_order_line_items oli
      on oli.shopify_line_item_id = (t.item->>'orderLineItemShopifyId')::bigint;
  end if;

  return query select v_refund_id, true, v_order_id;
end;
$$;

revoke all on function public.sync_shopify_refund(bigint, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_shopify_refund(bigint, bigint, jsonb, jsonb) to service_role;

-- Concurrency-safe checkpoint claim for the (not yet built) backfill/
-- enrichment scripts -- see the plan's checkpoint-safety section. A
-- caller must successfully claim (get a non-empty result) before reading
-- or advancing a job's checkpoint; a second concurrent invocation for
-- the same job_name gets nothing back and must not proceed.
create or replace function public.claim_shopify_sync_checkpoint(
  p_job_name text,
  p_locked_by text,
  p_params_fingerprint text,
  p_lease_minutes integer default 10
)
returns table (
  job_name text, pagination_cursor text, last_processed_shopify_order_id bigint,
  last_processed_created_at timestamptz, orders_processed_count integer,
  status text, params_fingerprint text, fingerprint_matches boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  -- ON CONFLICT's target-column list is parsed as a general expression
  -- list (it has to be, to support expression-based unique indexes) --
  -- unlike a plain INSERT target-column list, which is restricted,
  -- column-names-only grammar. That makes a bare `job_name` here subject
  -- to the same ambiguity as a WHERE/RETURNING/SELECT-list reference
  -- would be: this function RETURNS TABLE(job_name, ...), so `job_name`
  -- is also an in-scope OUT-parameter variable, and `on conflict
  -- (job_name)` is ambiguous between it and the column (error 42702,
  -- confirmed in staging). Naming the conflict target by its backing
  -- constraint instead sidesteps this entirely: a constraint name is
  -- resolved purely by catalog lookup, never treated as a value
  -- expression, so it can never collide with a plpgsql variable no
  -- matter what it's named. shopify_sync_checkpoints_job_name_key is
  -- Postgres's standard auto-generated name for the inline `unique`
  -- constraint on job_name declared in this table's CREATE TABLE above.
  insert into public.shopify_sync_checkpoints as c (
    job_name, status, started_at, updated_at, locked_by, locked_at, params_fingerprint
  )
  values (p_job_name, 'in_progress', now(), now(), p_locked_by, now(), p_params_fingerprint)
  on conflict on constraint shopify_sync_checkpoints_job_name_key do update set
    locked_by = p_locked_by,
    locked_at = now()
  where c.locked_at is null or c.locked_at < now() - make_interval(mins => p_lease_minutes)
  returning true into v_claimed;

  if v_claimed is not true then
    return; -- zero rows: another run already holds a live lease
  end if;

  return query
  select c.job_name, c.pagination_cursor, c.last_processed_shopify_order_id,
         c.last_processed_created_at, c.orders_processed_count, c.status,
         c.params_fingerprint,
         (c.params_fingerprint is null or c.params_fingerprint = p_params_fingerprint)
  from public.shopify_sync_checkpoints c
  where c.job_name = p_job_name;
end;
$$;

revoke all on function public.claim_shopify_sync_checkpoint(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_shopify_sync_checkpoint(text, text, text, integer) to service_role;

-- Advances a checkpoint's progress. Rejects (returns false, touches
-- nothing) unless BOTH hold: (1) p_locked_by matches the row's current
-- owner -- the ownership check -- and (2) that owner's lease is still
-- fresh, i.e. locked_at is within p_lease_minutes of now -- the expiry
-- check. The two are independent failure modes a caller needs to tell
-- apart (an ownership failure means someone else now legitimately owns
-- this job; an expiry failure, with ownership still intact, means this
-- worker's own lease went stale -- e.g. it stalled past its lease
-- window without anyone else reclaiming it yet -- and it must re-claim
-- via claim_shopify_sync_checkpoint() before it's allowed to report
-- further progress, rather than silently keep advancing on a lease that
-- should already be considered dead. p_lease_minutes should be passed
-- the same value the caller used for claim_shopify_sync_checkpoint.
create or replace function public.advance_shopify_sync_checkpoint(
  p_job_name text,
  p_locked_by text,
  p_pagination_cursor text,
  p_last_processed_shopify_order_id bigint,
  p_last_processed_created_at timestamptz,
  p_orders_processed_delta integer,
  p_status text default 'in_progress',
  p_error_message text default null,
  p_lease_minutes integer default 10
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated boolean;
begin
  update public.shopify_sync_checkpoints
  set pagination_cursor = coalesce(p_pagination_cursor, pagination_cursor),
      last_processed_shopify_order_id = coalesce(p_last_processed_shopify_order_id, last_processed_shopify_order_id),
      last_processed_created_at = coalesce(p_last_processed_created_at, last_processed_created_at),
      orders_processed_count = orders_processed_count + coalesce(p_orders_processed_delta, 0),
      status = p_status,
      error_message = p_error_message,
      updated_at = now(),
      locked_at = case when p_status = 'in_progress' then now() else locked_at end
  where job_name = p_job_name
    and locked_by = p_locked_by
    and locked_at >= now() - make_interval(mins => p_lease_minutes)
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

revoke all on function public.advance_shopify_sync_checkpoint(text, text, text, bigint, timestamptz, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.advance_shopify_sync_checkpoint(text, text, text, bigint, timestamptz, integer, text, text, integer) to service_role;

commit;
