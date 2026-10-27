-- SQL-level tests for database/migrations/20261026_add_shopify_order_lifecycle_sync.sql.
--
-- NOT YET RUN -- no local Postgres/Supabase CLI or staging database was
-- available in the environment this was written in. Run this manually
-- via `psql` against a database that already has the migration applied
-- (see the implementation report for exact instructions).
--
-- SAFETY: this entire file runs inside one transaction that is rolled
-- back at the very end (see the final ROLLBACK), regardless of whether
-- every test passes -- so it is safe to run against a real database,
-- including production, without leaving any test data behind. It uses
-- synthetic shopify_order_id values in a reserved negative range
-- (real Shopify ids are always positive) so nothing here can ever
-- collide with genuine data even before the rollback.
--
-- Each test is a DO block that RAISEs an exception (aborting the whole
-- script/transaction) on failure, or a NOTICE on success -- run with
-- `psql -f this_file.sql` and read the NOTICE/ERROR output.

begin;

-- ---------------------------------------------------------------------
-- Test 1: calling sync_shopify_order twice with the SAME updatedAt
-- converges to one row, not a duplicate (idempotency / retry-safety).
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000001;
  v_result record;
  v_count integer;
begin
  select * into v_result from public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T1', 'updatedAt', '2026-01-01T00:00:00Z', 'financialStatus', 'paid'),
    null, false, null, 'webhook'
  );
  if not (v_result.applied and v_result.is_new) then
    raise exception 'FAIL (test 1a): expected first call to apply as a new row';
  end if;

  select * into v_result from public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T1', 'updatedAt', '2026-01-01T00:00:00Z', 'financialStatus', 'paid'),
    null, false, null, 'webhook'
  );
  if not (v_result.applied and not v_result.is_new) then
    raise exception 'FAIL (test 1b): expected second identical-timestamp call to apply as an existing row';
  end if;

  select count(*) into v_count from public.shopify_orders where shopify_order_id = v_order_id;
  if v_count != 1 then
    raise exception 'FAIL (test 1c): expected exactly 1 row, found %', v_count;
  end if;

  raise notice 'PASS: test 1 (duplicate-delivery idempotency)';
end $$;

-- ---------------------------------------------------------------------
-- Test 2: a strictly-older updatedAt delivered after a newer one is
-- rejected and does not regress stored data (out-of-order protection).
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000002;
  v_result record;
  v_status text;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T2', 'updatedAt', '2026-01-02T00:00:00Z', 'financialStatus', 'paid'),
    null, false, null, 'webhook'
  );

  select * into v_result from public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T2', 'updatedAt', '2026-01-01T00:00:00Z', 'financialStatus', 'refunded'),
    null, false, null, 'webhook'
  );
  if v_result.applied then
    raise exception 'FAIL (test 2a): expected the older-timestamped delivery to be rejected as stale';
  end if;

  select financial_status into v_status from public.shopify_orders where shopify_order_id = v_order_id;
  if v_status != 'paid' then
    raise exception 'FAIL (test 2b): stale delivery regressed financial_status to %, expected it to stay paid', v_status;
  end if;

  raise notice 'PASS: test 2 (strictly-older delivery rejected, no regression)';
end $$;

-- ---------------------------------------------------------------------
-- Test 3: an EQUAL updatedAt (the enrichment case) is accepted, not
-- treated as stale -- and a partial fields object (only the keys the
-- enrichment caller actually re-fetched) never blanks out a field it
-- didn't include. This is the direct test of the equal-timestamp fix
-- and the "enrichment cannot overwrite existing fields with missing
-- data" requirement.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000003;
  v_result record;
  v_row public.shopify_orders;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object(
      'orderNumber', '#T3', 'updatedAt', '2026-01-03T00:00:00Z',
      'shippingMethod', 'UPS Ground', 'financialStatus', 'paid'
    ),
    null, false, null, 'webhook'
  );

  -- Simulated enrichment touch: SAME updatedAt, but the fields object
  -- only carries the keys enrichment actually re-fetched (cancelReason,
  -- financialStatusRaw) -- shippingMethod/financialStatus are
  -- deliberately ABSENT, not null, to prove the distinction matters.
  select * into v_result from public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object(
      'updatedAt', '2026-01-03T00:00:00Z',
      'cancelReason', 'customer',
      'financialStatusRaw', 'PAID'
    ),
    null, false, null, 'historical_import'
  );
  if not v_result.applied then
    raise exception 'FAIL (test 3a): expected the equal-timestamp enrichment touch to be applied, not rejected as stale';
  end if;

  select * into v_row from public.shopify_orders where shopify_order_id = v_order_id;
  if v_row.shipping_method != 'UPS Ground' then
    raise exception 'FAIL (test 3b): shipping_method was blanked to % by a touch that never mentioned it', v_row.shipping_method;
  end if;
  if v_row.financial_status != 'paid' then
    raise exception 'FAIL (test 3c): financial_status was blanked to % by a touch that never mentioned it', v_row.financial_status;
  end if;
  if v_row.cancel_reason != 'customer' then
    raise exception 'FAIL (test 3d): expected cancel_reason to be populated by the enrichment touch, got %', v_row.cancel_reason;
  end if;
  if v_row.financial_status_raw != 'PAID' then
    raise exception 'FAIL (test 3e): expected financial_status_raw to be populated by the enrichment touch';
  end if;

  raise notice 'PASS: test 3 (equal-timestamp enrichment proceeds without overwriting fields it did not fetch)';
end $$;

-- ---------------------------------------------------------------------
-- Test 4: a fulfillment arriving before its parent order creates a stub
-- order row, and the real order touch -- arriving later -- fully
-- overwrites the stub regardless of arrival order.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000004;
  v_fulfillment_result record;
  v_order_row public.shopify_orders;
begin
  select * into v_fulfillment_result from public.sync_shopify_fulfillment(
    v_order_id, -800000004,
    jsonb_build_object('status', 'success', 'updatedAtShopify', '2026-01-04T00:00:00Z'),
    null
  );

  select * into v_order_row from public.shopify_orders where shopify_order_id = v_order_id;
  if v_order_row.id is null then
    raise exception 'FAIL (test 4a): expected a stub shopify_orders row to exist after the fulfillment touch';
  end if;
  if v_order_row.source != 'fulfillment_webhook_stub' then
    raise exception 'FAIL (test 4b): expected source = fulfillment_webhook_stub, got %', v_order_row.source;
  end if;
  if v_order_row.order_updated_at is not null then
    raise exception 'FAIL (test 4c): expected the stub row''s order_updated_at to be null';
  end if;

  -- The real order arrives afterward.
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T4', 'updatedAt', '2026-01-04T00:05:00Z', 'financialStatus', 'paid'),
    null, false, null, 'webhook'
  );

  select * into v_order_row from public.shopify_orders where shopify_order_id = v_order_id;
  if v_order_row.order_number != '#T4' or v_order_row.source != 'fulfillment_webhook_stub' then
    raise exception 'FAIL (test 4d): expected the real order data to fill in the stub row while source stays set-once';
  end if;

  if (select count(*) from public.shopify_fulfillments where order_id = v_order_row.id) != 1 then
    raise exception 'FAIL (test 4e): expected exactly one fulfillment row linked to the (now real) order';
  end if;

  raise notice 'PASS: test 4 (fulfillment-before-order stub strategy)';
end $$;

-- ---------------------------------------------------------------------
-- Test 5: discount replacement distinguishes "no opinion" (null) from
-- "confirmed empty" ([]) from a populated set, and never drops existing
-- rows when the caller has no opinion about discounts this touch.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000005;
  v_count integer;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T5', 'updatedAt', '2026-01-05T00:00:00Z'),
    null, false, null, 'webhook'
  );

  -- Populate discounts.
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('updatedAt', '2026-01-05T00:01:00Z'),
    null, false,
    jsonb_build_array(jsonb_build_object(
      'applicationIndex', 0, 'applicationType', 'discount_code', 'code', 'SAVE10',
      'valueType', 'percentage', 'valuePercentage', 10, 'targetType', 'line_item',
      'allocations', jsonb_build_array()
    )),
    'webhook'
  );
  select count(*) into v_count from public.shopify_order_discounts where order_id = (select id from public.shopify_orders where shopify_order_id = v_order_id);
  if v_count != 1 then
    raise exception 'FAIL (test 5a): expected 1 discount row after populating, found %', v_count;
  end if;

  -- A later touch with p_discounts = NULL ("no opinion") must not
  -- touch the existing discount rows.
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('updatedAt', '2026-01-05T00:02:00Z', 'financialStatus', 'paid'),
    null, false, null, 'webhook'
  );
  select count(*) into v_count from public.shopify_order_discounts where order_id = (select id from public.shopify_orders where shopify_order_id = v_order_id);
  if v_count != 1 then
    raise exception 'FAIL (test 5b): a null-discounts touch must preserve existing discount rows, found %', v_count;
  end if;

  -- A touch with an EXPLICIT empty array must clear them.
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('updatedAt', '2026-01-05T00:03:00Z'),
    null, false, '[]'::jsonb, 'webhook'
  );
  select count(*) into v_count from public.shopify_order_discounts where order_id = (select id from public.shopify_orders where shopify_order_id = v_order_id);
  if v_count != 0 then
    raise exception 'FAIL (test 5c): an explicit empty discount list must clear existing rows, found %', v_count;
  end if;

  raise notice 'PASS: test 5 (discount missing vs. explicit-empty vs. populated)';
end $$;

-- ---------------------------------------------------------------------
-- Test 6: discount replacement is atomic -- a failure partway through
-- must roll back the delete too, never leaving a partially-replaced set.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000006;
  v_count integer;
  v_threw boolean := false;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T6', 'updatedAt', '2026-01-06T00:00:00Z'),
    null, false,
    jsonb_build_array(jsonb_build_object(
      'applicationIndex', 0, 'applicationType', 'automatic', 'title', 'Auto 10%',
      'valueType', 'percentage', 'valuePercentage', 10, 'targetType', 'line_item'
    )),
    'webhook'
  );
  select count(*) into v_count from public.shopify_order_discounts where order_id = (select id from public.shopify_orders where shopify_order_id = v_order_id);
  if v_count != 1 then
    raise exception 'FAIL (test 6 setup): expected 1 discount row before the forced-failure attempt';
  end if;

  -- This payload's second element has a non-numeric valuePercentage,
  -- which must raise a cast error partway through the replace loop --
  -- after the DELETE has already run but before every INSERT completes.
  begin
    perform public.sync_shopify_order(
      v_order_id, null,
      jsonb_build_object('updatedAt', '2026-01-06T00:01:00Z'),
      null, false,
      jsonb_build_array(
        jsonb_build_object('applicationIndex', 0, 'applicationType', 'automatic', 'valuePercentage', 5),
        jsonb_build_object('applicationIndex', 1, 'applicationType', 'automatic', 'valuePercentage', 'not-a-number')
      ),
      'webhook'
    );
  exception when others then
    v_threw := true;
  end;

  if not v_threw then
    raise exception 'FAIL (test 6a): expected the malformed second call to raise an exception';
  end if;

  select count(*) into v_count from public.shopify_order_discounts where order_id = (select id from public.shopify_orders where shopify_order_id = v_order_id);
  if v_count != 1 then
    raise exception 'FAIL (test 6b): expected the original discount row to survive a failed replacement attempt intact, found %', v_count;
  end if;

  raise notice 'PASS: test 6 (discount replacement is all-or-nothing)';
end $$;

-- ---------------------------------------------------------------------
-- Test 7: multiple refund-line entries for the SAME original line item
-- within one refund are never collapsed into a single row.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000007;
  v_line_item_shopify_id bigint := -800000007;
  v_count integer;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T7', 'updatedAt', '2026-01-07T00:00:00Z'),
    jsonb_build_array(jsonb_build_object(
      'shopifyLineItemId', v_line_item_shopify_id, 'title', 'Jersey', 'quantity', 3, 'price', 20.00
    )),
    true, null, 'webhook'
  );

  perform public.sync_shopify_refund(
    v_order_id, -810000007,
    jsonb_build_object('totalRefunded', 20.00),
    jsonb_build_array(
      jsonb_build_object('orderLineItemShopifyId', v_line_item_shopify_id, 'quantity', 1, 'subtotal', 10.00),
      jsonb_build_object('orderLineItemShopifyId', v_line_item_shopify_id, 'quantity', 1, 'subtotal', 10.00)
    )
  );

  select count(*) into v_count from public.shopify_refund_line_items rli
  join public.shopify_refunds r on r.id = rli.refund_id
  where r.shopify_refund_id = -810000007;
  if v_count != 2 then
    raise exception 'FAIL (test 7): expected 2 distinct refund-line rows for the same original line item, found %', v_count;
  end if;

  raise notice 'PASS: test 7 (refund lines for the same original item are not collapsed)';
end $$;

-- ---------------------------------------------------------------------
-- Test 8: upsert_shopify_customer is a single atomic statement -- two
-- touches for the same shopify_customer_id converge to one row,
-- first_seen_at never moves, and the latest values win. (This proves
-- the function's own atomicity; it does NOT prove a true concurrent-
-- session race is closed -- that needs two live connections, noted as
-- a manual follow-up in the implementation report.)
-- ---------------------------------------------------------------------
do $$
declare
  v_shopify_customer_id bigint := -900000008;
  v_id_1 bigint;
  v_id_2 bigint;
  v_count integer;
  v_first_seen_1 timestamptz;
  v_first_seen_2 timestamptz;
  v_email text;
begin
  v_id_1 := public.upsert_shopify_customer(jsonb_build_object(
    'shopifyCustomerId', v_shopify_customer_id, 'email', 'first@example.com'
  ));
  select first_seen_at into v_first_seen_1 from public.shopify_customers where id = v_id_1;

  perform pg_sleep(0.01); -- ensure a measurable now() difference if first_seen_at were (wrongly) reset

  v_id_2 := public.upsert_shopify_customer(jsonb_build_object(
    'shopifyCustomerId', v_shopify_customer_id, 'email', 'second@example.com'
  ));
  select first_seen_at, email into v_first_seen_2, v_email from public.shopify_customers where id = v_id_2;

  if v_id_1 != v_id_2 then
    raise exception 'FAIL (test 8a): expected both calls to resolve to the same internal id';
  end if;
  if v_first_seen_1 != v_first_seen_2 then
    raise exception 'FAIL (test 8b): first_seen_at must never move on a conflict touch';
  end if;
  if v_email != 'second@example.com' then
    raise exception 'FAIL (test 8c): expected the second call''s email to win, got %', v_email;
  end if;

  select count(*) into v_count from public.shopify_customers where shopify_customer_id = v_shopify_customer_id;
  if v_count != 1 then
    raise exception 'FAIL (test 8d): expected exactly 1 customer row, found %', v_count;
  end if;

  raise notice 'PASS: test 8 (customer upsert atomicity -- single-session proxy only, see comment)';
end $$;

-- ---------------------------------------------------------------------
-- Test 9: checkpoint claim/lease -- a second claim attempt for the same
-- job_name while a lease is live is refused (zero rows), and succeeds
-- once the lease is expired.
-- ---------------------------------------------------------------------
do $$
declare
  v_job text := 'test_job_' || extract(epoch from now())::text;
  v_claim_a record;
  v_claim_b record;
  v_found boolean;
begin
  select * into v_claim_a from public.claim_shopify_sync_checkpoint(v_job, 'worker_a', 'fp1');
  if v_claim_a.job_name is null then
    raise exception 'FAIL (test 9a): expected worker_a to successfully claim a fresh job';
  end if;

  select exists(select 1 from public.claim_shopify_sync_checkpoint(v_job, 'worker_b', 'fp1')) into v_found;
  if v_found then
    raise exception 'FAIL (test 9b): expected worker_b to be refused while worker_a''s lease is still live';
  end if;

  -- Simulate an expired lease.
  update public.shopify_sync_checkpoints set locked_at = now() - interval '1 hour' where job_name = v_job;

  select * into v_claim_b from public.claim_shopify_sync_checkpoint(v_job, 'worker_b', 'fp1');
  if v_claim_b.job_name is null then
    raise exception 'FAIL (test 9c): expected worker_b to successfully claim the job once the lease expired';
  end if;

  raise notice 'PASS: test 9 (checkpoint claim/lease concurrency guard)';
end $$;

-- ---------------------------------------------------------------------
-- Test 10: checkpoint parameter-fingerprint mismatch is reported
-- accurately, so a future resuming caller can refuse to proceed.
-- ---------------------------------------------------------------------
do $$
declare
  v_job text := 'test_job_fp_' || extract(epoch from now())::text;
  v_claim record;
begin
  perform public.claim_shopify_sync_checkpoint(v_job, 'worker_a', 'fp_original');
  update public.shopify_sync_checkpoints set locked_at = now() - interval '1 hour' where job_name = v_job;

  select * into v_claim from public.claim_shopify_sync_checkpoint(v_job, 'worker_a', 'fp_different');
  if v_claim.fingerprint_matches then
    raise exception 'FAIL (test 10): expected fingerprint_matches = false for a changed set of parameters';
  end if;

  raise notice 'PASS: test 10 (parameter-fingerprint drift is reported accurately)';
end $$;

-- ---------------------------------------------------------------------
-- Test 11: a fulfillment arriving BEFORE its order's line items leaves
-- an unresolved (order_line_item_id = NULL) reference; once the order's
-- line items are written, the reference is automatically reconciled --
-- no separate backfill pass required.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000011;
  v_line_item_shopify_id bigint := -800000011;
  v_resolved_id bigint;
  v_order_internal_id bigint;
begin
  -- Fulfillment arrives first, referencing a line item that doesn't
  -- exist in shopify_order_line_items yet.
  perform public.sync_shopify_fulfillment(
    v_order_id, -810000011,
    jsonb_build_object('status', 'success', 'updatedAtShopify', '2026-01-11T00:00:00Z'),
    jsonb_build_array(jsonb_build_object('orderLineItemShopifyId', v_line_item_shopify_id, 'quantity', 2))
  );

  select order_line_item_id into v_resolved_id
  from public.shopify_fulfillment_line_items
  where shopify_line_item_id = v_line_item_shopify_id;
  if v_resolved_id is not null then
    raise exception 'FAIL (test 11a): expected the reference to be unresolved before the order''s line items exist';
  end if;

  -- The real order, with its line items, arrives afterward.
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T11', 'updatedAt', '2026-01-11T00:05:00Z'),
    jsonb_build_array(jsonb_build_object('shopifyLineItemId', v_line_item_shopify_id, 'title', 'Hoodie', 'quantity', 2, 'price', 35.00)),
    true, null, 'webhook'
  );

  select id into v_order_internal_id from public.shopify_orders where shopify_order_id = v_order_id;

  select order_line_item_id into v_resolved_id
  from public.shopify_fulfillment_line_items
  where shopify_line_item_id = v_line_item_shopify_id;
  if v_resolved_id is null then
    raise exception 'FAIL (test 11b): expected the fulfillment line item reference to be auto-resolved once the order line item exists';
  end if;

  if v_resolved_id != (select id from public.shopify_order_line_items where shopify_line_item_id = v_line_item_shopify_id) then
    raise exception 'FAIL (test 11c): resolved order_line_item_id does not point at the correct shopify_order_line_items row';
  end if;

  raise notice 'PASS: test 11 (fulfillment-before-order-line-items auto-reconciliation)';
end $$;

-- ---------------------------------------------------------------------
-- Test 12: the same auto-reconciliation applies to refund line items.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000012;
  v_line_item_shopify_id bigint := -800000012;
  v_resolved_id bigint;
begin
  perform public.sync_shopify_refund(
    v_order_id, -810000012,
    jsonb_build_object('totalRefunded', 15.00),
    jsonb_build_array(jsonb_build_object('orderLineItemShopifyId', v_line_item_shopify_id, 'quantity', 1, 'subtotal', 15.00))
  );

  select order_line_item_id into v_resolved_id
  from public.shopify_refund_line_items
  where shopify_line_item_id = v_line_item_shopify_id;
  if v_resolved_id is not null then
    raise exception 'FAIL (test 12a): expected the refund line item reference to be unresolved before the order line item exists';
  end if;

  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T12', 'updatedAt', '2026-01-12T00:05:00Z'),
    jsonb_build_array(jsonb_build_object('shopifyLineItemId', v_line_item_shopify_id, 'title', 'Cap', 'quantity', 1, 'price', 15.00)),
    true, null, 'webhook'
  );

  select order_line_item_id into v_resolved_id
  from public.shopify_refund_line_items
  where shopify_line_item_id = v_line_item_shopify_id;
  if v_resolved_id is null then
    raise exception 'FAIL (test 12b): expected the refund line item reference to be auto-resolved once the order line item exists';
  end if;

  raise notice 'PASS: test 12 (refund-before-order-line-items auto-reconciliation)';
end $$;

-- ---------------------------------------------------------------------
-- Test 13: reconciliation only resolves rows still unresolved -- it
-- never touches a reference that was already correctly linked (e.g.
-- the normal case where the fulfillment arrives after the order).
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000013;
  v_line_item_shopify_id bigint := -800000013;
  v_resolved_id bigint;
  v_order_line_item_id bigint;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T13', 'updatedAt', '2026-01-13T00:00:00Z'),
    jsonb_build_array(jsonb_build_object('shopifyLineItemId', v_line_item_shopify_id, 'title', 'Socks', 'quantity', 1, 'price', 8.00)),
    true, null, 'webhook'
  );
  select id into v_order_line_item_id from public.shopify_order_line_items where shopify_line_item_id = v_line_item_shopify_id;

  perform public.sync_shopify_fulfillment(
    v_order_id, -810000013,
    jsonb_build_object('status', 'success', 'updatedAtShopify', '2026-01-13T00:05:00Z'),
    jsonb_build_array(jsonb_build_object('orderLineItemShopifyId', v_line_item_shopify_id, 'quantity', 1))
  );

  select order_line_item_id into v_resolved_id
  from public.shopify_fulfillment_line_items
  where shopify_line_item_id = v_line_item_shopify_id;
  if v_resolved_id != v_order_line_item_id then
    raise exception 'FAIL (test 13): expected the already-resolvable reference to link correctly on first insert, without needing reconciliation';
  end if;

  raise notice 'PASS: test 13 (normal arrival order resolves immediately, reconciliation is a no-op)';
end $$;

-- ---------------------------------------------------------------------
-- Test 14: advance_shopify_sync_checkpoint -- successful advancement by
-- the current lease holder.
-- ---------------------------------------------------------------------
do $$
declare
  v_job text := 'test_job_adv_ok_' || extract(epoch from now())::text;
  v_result boolean;
  v_row public.shopify_sync_checkpoints;
begin
  perform public.claim_shopify_sync_checkpoint(v_job, 'worker_a', 'fp1');

  v_result := public.advance_shopify_sync_checkpoint(
    v_job, 'worker_a', 'cursor_abc', 12345, '2026-01-14T00:00:00Z'::timestamptz, 7
  );
  if not v_result then
    raise exception 'FAIL (test 14a): expected the current lease holder''s advance to succeed';
  end if;

  select * into v_row from public.shopify_sync_checkpoints where job_name = v_job;
  if v_row.pagination_cursor != 'cursor_abc' or v_row.orders_processed_count != 7 then
    raise exception 'FAIL (test 14b): expected the checkpoint fields to reflect the advance call';
  end if;

  raise notice 'PASS: test 14 (advance_shopify_sync_checkpoint succeeds for the current lease holder)';
end $$;

-- ---------------------------------------------------------------------
-- Test 15: advance_shopify_sync_checkpoint -- rejected for the wrong
-- lease holder (ownership failure), with no fields changed.
-- ---------------------------------------------------------------------
do $$
declare
  v_job text := 'test_job_adv_wrong_' || extract(epoch from now())::text;
  v_result boolean;
  v_count_before integer;
begin
  perform public.claim_shopify_sync_checkpoint(v_job, 'worker_a', 'fp1');

  select orders_processed_count into v_count_before from public.shopify_sync_checkpoints where job_name = v_job;

  v_result := public.advance_shopify_sync_checkpoint(
    v_job, 'worker_b', null, null, null, 99
  );
  if v_result then
    raise exception 'FAIL (test 15a): expected advance to be rejected for a non-owning worker';
  end if;

  if (select orders_processed_count from public.shopify_sync_checkpoints where job_name = v_job) != v_count_before then
    raise exception 'FAIL (test 15b): a rejected advance must not change any field';
  end if;

  raise notice 'PASS: test 15 (advance_shopify_sync_checkpoint rejects the wrong lease holder)';
end $$;

-- ---------------------------------------------------------------------
-- Test 16: advance_shopify_sync_checkpoint -- rejected once the correct
-- holder's own lease has expired, even though ownership (locked_by)
-- still matches and nobody else has reclaimed it yet.
-- ---------------------------------------------------------------------
do $$
declare
  v_job text := 'test_job_adv_expired_' || extract(epoch from now())::text;
  v_result boolean;
begin
  perform public.claim_shopify_sync_checkpoint(v_job, 'worker_a', 'fp1', 10);
  update public.shopify_sync_checkpoints set locked_at = now() - interval '20 minutes' where job_name = v_job;

  v_result := public.advance_shopify_sync_checkpoint(
    v_job, 'worker_a', null, null, null, 1, 'in_progress', null, 10
  );
  if v_result then
    raise exception 'FAIL (test 16): expected advance to be rejected once the lease (10 minutes) has expired, even for the correct owner';
  end if;

  raise notice 'PASS: test 16 (advance_shopify_sync_checkpoint rejects an expired lease even with correct ownership)';
end $$;

-- ---------------------------------------------------------------------
-- Test 17: sync_shopify_order_discounts(), called STANDALONE (not via
-- sync_shopify_order) -- the exact way the new orders/create discount
-- call in frontend/app/api/webhooks/shopify/ingest.ts uses it. Exercises
-- the full no-discount -> add-discount -> remove-discount lifecycle
-- against an order that already exists (created here via
-- sync_shopify_order first, mirroring upsertNormalizedOrder() already
-- having run before this call in the real code path).
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000017;
  v_internal_order_id bigint;
  v_count integer;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T17', 'updatedAt', '2026-01-17T00:00:00Z'),
    null, false, null, 'webhook'
  );
  select id into v_internal_order_id from public.shopify_orders where shopify_order_id = v_order_id;

  -- No discount yet: standalone call with an empty array must leave
  -- zero rows (confirmed empty), same contract as sync_shopify_order's
  -- own p_discounts handling.
  perform public.sync_shopify_order_discounts(v_order_id, '[]'::jsonb);
  select count(*) into v_count from public.shopify_order_discounts where order_id = v_internal_order_id;
  if v_count != 0 then
    raise exception 'FAIL (test 17a): expected zero discount rows for a confirmed-empty standalone touch, found %', v_count;
  end if;

  -- Update adds a discount.
  perform public.sync_shopify_order_discounts(
    v_order_id,
    jsonb_build_array(jsonb_build_object(
      'applicationIndex', 0, 'applicationType', 'discount_code', 'code', 'ADD10',
      'valueType', 'fixed_amount', 'valueAmount', 10.00, 'allocations', '[]'::jsonb
    ))
  );
  select count(*) into v_count from public.shopify_order_discounts where order_id = v_internal_order_id;
  if v_count != 1 then
    raise exception 'FAIL (test 17b): expected 1 discount row after the standalone add, found %', v_count;
  end if;

  -- Update removes the discount again.
  perform public.sync_shopify_order_discounts(v_order_id, '[]'::jsonb);
  select count(*) into v_count from public.shopify_order_discounts where order_id = v_internal_order_id;
  if v_count != 0 then
    raise exception 'FAIL (test 17c): expected zero discount rows after the standalone removal, found %', v_count;
  end if;

  raise notice 'PASS: test 17 (sync_shopify_order_discounts standalone: no-discount -> add -> remove)';
end $$;

-- ---------------------------------------------------------------------
-- Test 18: real production order #15065's shape -- a $60.00
-- fixed-amount discount code, capped by Shopify to $54.72 actually
-- allocated. Run end to end via sync_shopify_order (confirming the
-- 20261029 extraction/refactor did not change its external behavior)
-- and asserts the configured value (60) and the actually-allocated
-- total (54.72) land in the correct, separate columns -- never
-- conflated. See frontend/scripts/verifyShopifyLifecycleIngestion.ts's
-- matching TypeScript-level test of the same real shape.
-- ---------------------------------------------------------------------
do $$
declare
  v_order_id bigint := -900000018;
  v_line_item_shopify_id bigint := -800000018;
  v_internal_order_id bigint;
  v_discount_row record;
  v_allocated_total numeric;
begin
  perform public.sync_shopify_order(
    v_order_id, null,
    jsonb_build_object('orderNumber', '#T18', 'updatedAt', '2026-01-18T00:00:00Z'),
    jsonb_build_array(jsonb_build_object('shopifyLineItemId', v_line_item_shopify_id, 'title', 'Jersey', 'quantity', 1, 'price', 54.72)),
    true,
    jsonb_build_array(jsonb_build_object(
      'applicationIndex', 0, 'applicationType', 'discount_code', 'code', '8PW77TL',
      'valueType', 'fixed_amount', 'valueAmount', 60.00,
      'allocations', jsonb_build_array(jsonb_build_object(
        'orderLineItemShopifyId', v_line_item_shopify_id, 'isShippingLineAllocation', false, 'allocatedAmount', 54.72
      ))
    )),
    'webhook'
  );
  select id into v_internal_order_id from public.shopify_orders where shopify_order_id = v_order_id;

  select * into v_discount_row from public.shopify_order_discounts where order_id = v_internal_order_id;
  if v_discount_row.value_amount != 60.00 then
    raise exception 'FAIL (test 18a): expected the discount''s OWN configured value_amount to be 60.00, got %', v_discount_row.value_amount;
  end if;
  if v_discount_row.code != '8PW77TL' then
    raise exception 'FAIL (test 18b): expected code 8PW77TL, got %', v_discount_row.code;
  end if;

  select sum(allocated_amount) into v_allocated_total
  from public.shopify_order_discount_allocations
  where order_discount_id = v_discount_row.id;
  if v_allocated_total != 54.72 then
    raise exception 'FAIL (test 18c): expected the actually-allocated total to be 54.72, got %', v_allocated_total;
  end if;
  if v_allocated_total = v_discount_row.value_amount then
    raise exception 'FAIL (test 18d): the configured value and the actually-allocated total must never be equal in this scenario (60.00 vs 54.72) -- got the same value for both, which would indicate they are being conflated';
  end if;

  raise notice 'PASS: test 18 (real #15065 shape: configured $60 vs. actually-allocated $54.72, stored separately)';
end $$;

-- ---------------------------------------------------------------------
-- Test 19: sync_shopify_order_discounts() called for a shopify_order_id
-- with no existing shopify_orders row raises an exception (fails
-- closed) rather than silently creating a stub -- a deliberate
-- difference from sync_shopify_fulfillment/sync_shopify_refund's
-- stub-order strategy, since this function is only ever meant to be
-- called immediately after the order's own row already exists in the
-- same transaction (either via sync_shopify_order itself, or via
-- orders/create's upsertNormalizedOrder() having already run).
-- ---------------------------------------------------------------------
do $$
declare
  v_missing_order_id bigint := -900000019;
  v_raised boolean := false;
begin
  begin
    perform public.sync_shopify_order_discounts(v_missing_order_id, '[]'::jsonb);
  exception when others then
    v_raised := true;
  end;

  if not v_raised then
    raise exception 'FAIL (test 19): expected an exception when no shopify_orders row exists for the given shopify_order_id';
  end if;

  raise notice 'PASS: test 19 (sync_shopify_order_discounts fails closed for a non-existent order, no stub created)';
end $$;

-- Nothing above is persisted -- this is deliberate (see the header
-- comment). Remove this ROLLBACK (and replace with COMMIT) only when
-- intentionally running against a disposable/local database where
-- leaving the synthetic test rows behind is acceptable.
rollback;
