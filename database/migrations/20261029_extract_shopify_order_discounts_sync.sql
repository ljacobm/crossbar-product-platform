-- Extracts the discount-replacement logic that already lives inside
-- sync_shopify_order() (database/migrations/20261026_add_shopify_order_
-- lifecycle_sync.sql, as corrected by 20261027/20261028) into its own,
-- independently callable function: sync_shopify_order_discounts().
--
-- WHY: orders/create (the live, highest-volume production webhook)
-- currently captures NO discount information at all -- it runs through
-- the old upsertNormalizedOrder() path (frontend/lib/shopifyNormalized.ts),
-- which never touches shopify_order_discounts/shopify_order_discount_
-- allocations. Those tables are today only ever written by the NEW
-- lifecycle topics (orders/updated|cancelled|edited), via
-- sync_shopify_order()'s inline discount block. To add discount capture
-- to orders/create WITHOUT changing its existing order/line-item
-- processing behavior (upsertOrder/upsertLineItems are completely
-- untouched by this migration), the discount-write logic needs to be
-- callable on its own, outside the rest of sync_shopify_order()'s
-- order-upsert/staleness machinery.
--
-- BEHAVIOR: byte-for-byte the same delete-then-reinsert-in-one-
-- transaction logic as before (same null/empty-array/populated JSON
-- CONTRACT semantics -- see shopify_order_discounts' own comment and
-- the existing SQL tests 5/6 in database/tests/
-- shopify_order_lifecycle_sync_test.sql, which must still pass
-- unchanged against this refactor). sync_shopify_order() itself is
-- updated ONLY to replace its inline discount block (and drop the two
-- now-unused v_discount/v_discount_id local variables) with a call to
-- this new function -- every other line of its body (order upsert,
-- staleness check, line-item upsert, removal detection, reconciliation,
-- edit_count bump) is unchanged, copied verbatim from the already-
-- applied 20261026 migration. Its external behavior (inputs/outputs,
-- staleness, atomicity) is unchanged; tests 1-6 all exercise it exactly
-- as before.
--
-- LOCKING: sync_shopify_order_discounts() independently acquires the
-- SAME per-shopify-order-id advisory lock as sync_shopify_order/
-- sync_shopify_fulfillment/sync_shopify_refund, so a standalone caller
-- (the new orders/create discount call) is correctly serialized against
-- a concurrent orders/updated touch for the same order. When called
-- FROM sync_shopify_order() (which already holds that same lock key for
-- this transaction), pg_advisory_xact_lock's per-transaction reference
-- counting makes the re-acquisition an immediate no-op -- never a
-- self-deadlock.
--
-- SAFE TO RUN NOW: only CREATE OR REPLACEs two functions. Does not
-- drop/alter any table, does not touch any existing row, does not
-- change RLS. CREATE OR REPLACE FUNCTION preserves ownership/grants
-- automatically; the REVOKE/GRANT below are restated anyway, matching
-- this migration set's existing convention (see 20261027/20261028).
begin;

-- One order's discount set, written independently of the rest of an
-- order touch. p_discounts: same JSON CONTRACT as sync_shopify_order's
-- own p_discounts parameter -- SQL null means "no opinion, don't touch
-- existing discount rows"; an empty JSON array '[]' means "this order
-- has confirmed zero discounts right now, clear existing rows"; a
-- populated array means "replace with exactly this set." See
-- NormalizedShopifyOrder's own comment in
-- frontend/lib/shopifyNormalized.ts for the three-state rationale.
create or replace function public.sync_shopify_order_discounts(
  p_shopify_order_id bigint,
  p_discounts jsonb
)
returns table (applied boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id bigint;
  v_discount jsonb;
  v_discount_id bigint;
begin
  if p_shopify_order_id is null then
    raise exception 'sync_shopify_order_discounts: p_shopify_order_id is required';
  end if;

  -- Same lock key as sync_shopify_order/sync_shopify_fulfillment/
  -- sync_shopify_refund -- see the migration header comment above.
  perform pg_advisory_xact_lock(hashtextextended('shopify_order:' || p_shopify_order_id::text, 0));

  select so.id into v_order_id from public.shopify_orders so
  where so.shopify_order_id = p_shopify_order_id;

  -- Unlike sync_shopify_fulfillment/sync_shopify_refund, this function
  -- never creates a stub order row -- it is only ever called (from
  -- either orders/create's new call site or from sync_shopify_order
  -- itself) immediately after the order's own row has already been
  -- inserted/updated in the SAME transaction, so a missing order here
  -- indicates a genuine caller error, not a legitimate cross-topic
  -- arrival-order race.
  if v_order_id is null then
    raise exception 'sync_shopify_order_discounts: no shopify_orders row found for shopify_order_id %', p_shopify_order_id;
  end if;

  -- Discounts: SQL null ("no opinion") vs. an explicit '[]' ("confirmed
  -- empty, clear existing rows") vs. a populated array -- see the JSON
  -- CONTRACT comment above. The delete and every insert below run in
  -- this same transaction, so a failure partway (e.g. a malformed row)
  -- rolls back the delete too; existing discount data is never left
  -- partially removed. Identical logic to the block this replaces.
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

  return query select true;
end;
$$;

revoke all on function public.sync_shopify_order_discounts(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.sync_shopify_order_discounts(bigint, jsonb) to service_role;

-- sync_shopify_order(): copied verbatim from 20261026 (as it stands,
-- already including the 20261027 RETURNING fix), EXCEPT the discount
-- block is replaced by a single call to sync_shopify_order_discounts(),
-- and v_discount/v_discount_id are dropped from the declare list since
-- nothing else in this function uses them anymore.
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
begin
  if p_source is null or p_shopify_order_id is null then
    raise exception 'sync_shopify_order: p_shopify_order_id and p_source are required';
  end if;

  -- Serializes every writer (order touches, fulfillment touches, refund
  -- touches, and now standalone discount touches -- see
  -- sync_shopify_fulfillment/sync_shopify_refund/
  -- sync_shopify_order_discounts, which all take the identical lock)
  -- touching this exact shopify_order_id. Different orders never
  -- contend. Transaction-scoped: released automatically on commit or
  -- rollback, never explicitly unlocked.
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

  -- Discounts: delegated to sync_shopify_order_discounts() -- same
  -- null/empty/populated JSON CONTRACT, same transaction, same lock
  -- (already held, so the re-acquisition inside it is a no-op). See
  -- this migration's header comment for the extraction rationale.
  perform public.sync_shopify_order_discounts(p_shopify_order_id, p_discounts);

  return query select v_order_id, true, v_is_new;
end;
$$;

revoke all on function public.sync_shopify_order(bigint, jsonb, jsonb, jsonb, boolean, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.sync_shopify_order(bigint, jsonb, jsonb, jsonb, boolean, jsonb, text, boolean) to service_role;

commit;
