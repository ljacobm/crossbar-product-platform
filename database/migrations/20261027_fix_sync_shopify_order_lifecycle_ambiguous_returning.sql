-- Corrective patch for database/migrations/20261026_add_shopify_order_lifecycle_sync.sql,
-- already applied to the "Crossbar OS Staging" Supabase project.
--
-- BUG: sync_shopify_fulfillment() and sync_shopify_refund() each
-- RETURNS TABLE(id bigint, applied boolean, order_id bigint) -- which
-- implicitly declares `id` as an OUT-parameter variable in scope for
-- the whole function body. Each function's stub-order-creation INSERT
-- (used when a fulfillment/refund event arrives before its parent
-- order has been synced) had an unqualified `returning id`, which
-- Postgres cannot resolve between that OUT variable and the
-- shopify_orders.id column -- confirmed in staging as:
--   ERROR: 42702: column reference "id" is ambiguous
--   PL/pgSQL function public.sync_shopify_fulfillment(bigint,bigint,jsonb,jsonb), line 28
--
-- Every other function and every other RETURNING clause in the original
-- migration was re-inspected for the same class of bug (bare, unqualified
-- column reference colliding with a RETURNS TABLE column or a declared
-- variable/parameter name) and confirmed NOT to have it -- every other
-- RETURNING clause already uses an explicit table alias
-- (c.id/so.id/od.id/sf.id/sr.id), and every bare column reference
-- elsewhere (INSERT target lists, ON CONFLICT target lists, UPDATE SET
-- target positions) sits in a position Postgres always resolves as a
-- plain table column, never subject to this ambiguity, regardless of
-- name overlap with a declared variable.
--
-- FIX: qualify the RETURNING clause with an explicit table alias, same
-- as every other INSERT/UPDATE in this migration already does.
--
-- SAFE TO RUN IN STAGING NOW: this patch only CREATE OR REPLACEs the two
-- affected functions. It does not drop or alter any table, does not
-- touch any row of data, and does not change RLS. CREATE OR REPLACE
-- FUNCTION preserves a function's existing ownership and granted
-- privileges automatically (per Postgres semantics) -- the REVOKE/GRANT
-- statements below are restated anyway, for explicitness, not because
-- anything would otherwise be lost.
--
-- This same fix has also been applied directly to
-- database/migrations/20261026_add_shopify_order_lifecycle_sync.sql, so
-- a future fresh install (schema_v2.sql + 20261026 + tests) never hits
-- this bug in the first place and does not need this patch file at all.
-- This patch exists solely to correct the copy that is already live in
-- staging without having to drop and recreate anything there.
begin;

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

  if v_order_id is null then
    -- FIXED: was `returning id` (bare, ambiguous against this
    -- function's own RETURNS TABLE(id, ...) OUT parameter) -- now
    -- explicitly qualified against the inserted table.
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
    -- FIXED: same ambiguity bug as sync_shopify_fulfillment above.
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

commit;
