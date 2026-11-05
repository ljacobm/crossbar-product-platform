-- SQL-level tests for database/migrations/20261105_add_online_store_vendor_tag_aliases.sql.
--
-- NOT YET RUN -- no local Postgres/Supabase CLI or staging database
-- connection was available in the environment this was written in. Run
-- manually via `psql -f this_file.sql` against a database that already
-- has the migration applied.
--
-- SAFETY: this entire file runs inside one transaction that is rolled
-- back at the very end (see the final ROLLBACK), regardless of whether
-- every test passes -- safe to run against any database, including
-- production, without leaving any test data behind. Test stores use
-- obviously-synthetic names/slugs/tags ('__test_...') and the one
-- synthetic order uses a reserved negative shopify_order_id (real
-- Shopify ids are always positive), so nothing here can ever collide
-- with genuine data even before the rollback.
--
-- Each test is a DO block that RAISEs an exception (aborting the whole
-- script/transaction) on failure, or a NOTICE on success -- run with
-- `psql -f this_file.sql` and read the NOTICE/ERROR output.

begin;

-- ---------------------------------------------------------------------
-- Test 1: a valid alias can be added for a store and is queryable.
-- ---------------------------------------------------------------------
do $$
declare
  v_store_id bigint;
  v_alias_id bigint;
begin
  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_1', '__test-store-1', '__test_store_1_primary')
  returning id into v_store_id;

  insert into online_store_vendor_tag_aliases (online_store_id, tag)
  values (v_store_id, '__test_store_1_alias')
  returning id into v_alias_id;

  if not exists (
    select 1 from online_store_vendor_tag_aliases
    where id = v_alias_id and online_store_id = v_store_id and tag = '__test_store_1_alias'
  ) then
    raise exception 'FAIL (test 1): alias row not found after insert';
  end if;

  raise notice 'PASS: test 1 (alias insert + lookup)';
end $$;

-- ---------------------------------------------------------------------
-- Test 2: an alias tag cannot equal ANOTHER store's primary
-- vendor_team_tag (direction 1 of the global-uniqueness invariant).
-- ---------------------------------------------------------------------
do $$
declare
  v_store_a bigint;
  v_store_b bigint;
  v_raised boolean := false;
begin
  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_2a', '__test-store-2a', '__test_store_2a_primary')
  returning id into v_store_a;

  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_2b', '__test-store-2b', '__test_store_2b_primary')
  returning id into v_store_b;

  begin
    insert into online_store_vendor_tag_aliases (online_store_id, tag)
    values (v_store_b, '__test_store_2a_primary');
  exception when others then
    v_raised := true;
  end;

  if not v_raised then
    raise exception 'FAIL (test 2): expected an exception when aliasing another store''s primary tag';
  end if;

  raise notice 'PASS: test 2 (alias cannot shadow another store''s primary tag)';
end $$;

-- ---------------------------------------------------------------------
-- Test 3: the same tag cannot be an alias for two different stores
-- (global uniqueness among aliases themselves).
-- ---------------------------------------------------------------------
do $$
declare
  v_store_a bigint;
  v_store_b bigint;
  v_raised boolean := false;
begin
  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_3a', '__test-store-3a', '__test_store_3a_primary')
  returning id into v_store_a;

  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_3b', '__test-store-3b', '__test_store_3b_primary')
  returning id into v_store_b;

  insert into online_store_vendor_tag_aliases (online_store_id, tag)
  values (v_store_a, '__test_store_3_shared_alias');

  begin
    insert into online_store_vendor_tag_aliases (online_store_id, tag)
    values (v_store_b, '__test_store_3_shared_alias');
  exception when unique_violation then
    v_raised := true;
  end;

  if not v_raised then
    raise exception 'FAIL (test 3): expected a unique_violation when two stores claim the same alias';
  end if;

  raise notice 'PASS: test 3 (alias tags are globally unique across stores)';
end $$;

-- ---------------------------------------------------------------------
-- Test 4: a store's primary vendor_team_tag cannot be set/updated to a
-- tag already claimed as another store's alias (direction 2 of the
-- global-uniqueness invariant).
-- ---------------------------------------------------------------------
do $$
declare
  v_store_a bigint;
  v_store_b bigint;
  v_raised boolean := false;
begin
  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_4a', '__test-store-4a', '__test_store_4a_primary')
  returning id into v_store_a;

  insert into online_store_vendor_tag_aliases (online_store_id, tag)
  values (v_store_a, '__test_store_4_alias');

  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_4b', '__test-store-4b', '__test_store_4b_primary')
  returning id into v_store_b;

  begin
    update online_stores set vendor_team_tag = '__test_store_4_alias' where id = v_store_b;
  exception when others then
    v_raised := true;
  end;

  if not v_raised then
    raise exception 'FAIL (test 4): expected an exception when a store''s primary tag collides with another store''s alias';
  end if;

  raise notice 'PASS: test 4 (primary tag cannot shadow another store''s alias)';
end $$;

-- ---------------------------------------------------------------------
-- Test 5: deleting a store cascades to delete its aliases.
-- ---------------------------------------------------------------------
do $$
declare
  v_store_id bigint;
  v_count integer;
begin
  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_5', '__test-store-5', '__test_store_5_primary')
  returning id into v_store_id;

  insert into online_store_vendor_tag_aliases (online_store_id, tag)
  values (v_store_id, '__test_store_5_alias');

  delete from online_stores where id = v_store_id;

  select count(*) into v_count from online_store_vendor_tag_aliases where online_store_id = v_store_id;
  if v_count != 0 then
    raise exception 'FAIL (test 5): expected aliases to cascade-delete with their store, found %', v_count;
  end if;

  raise notice 'PASS: test 5 (alias rows cascade-delete with their store)';
end $$;

-- ---------------------------------------------------------------------
-- Test 6: the historical-reconciliation UPDATE pattern (exact team_tag
-- + online_store_id IS NULL, the same shape as
-- database/reconciliation/20261105_iroquoisfh_vendor_tag_alias.sql) is
-- idempotent -- a second run matches zero rows and changes nothing.
-- ---------------------------------------------------------------------
do $$
declare
  v_store_id bigint;
  v_order_id bigint;
  v_first_run_count integer;
  v_second_run_count integer;
begin
  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_6', '__test-store-6', '__test_store_6_primary')
  returning id into v_store_id;

  insert into shopify_orders (shopify_order_id, source)
  values (-900000601, 'webhook')
  returning id into v_order_id;

  insert into shopify_order_line_items (order_id, shopify_line_item_id, team_tag, online_store_id)
  values (v_order_id, -900000601, '__test_store_6_tag', null);

  with updated as (
    update shopify_order_line_items
    set online_store_id = v_store_id
    where team_tag = '__test_store_6_tag' and online_store_id is null
    returning id
  )
  select count(*) into v_first_run_count from updated;

  if v_first_run_count != 1 then
    raise exception 'FAIL (test 6a): expected exactly 1 row reconciled on first run, got %', v_first_run_count;
  end if;

  with updated as (
    update shopify_order_line_items
    set online_store_id = v_store_id
    where team_tag = '__test_store_6_tag' and online_store_id is null
    returning id
  )
  select count(*) into v_second_run_count from updated;

  if v_second_run_count != 0 then
    raise exception 'FAIL (test 6b): expected 0 rows on second (idempotent) run, got %', v_second_run_count;
  end if;

  raise notice 'PASS: test 6 (reconciliation UPDATE pattern is idempotent)';
end $$;

-- ---------------------------------------------------------------------
-- Test 7: removing an alias does NOT retroactively unmatch line items
-- that were already associated with its store (requirement: "do not
-- automatically remap already-associated line items"). online_store_id
-- is written once, at ingestion/reconciliation time, and is never
-- re-derived from the alias table afterward.
-- ---------------------------------------------------------------------
do $$
declare
  v_store_id bigint;
  v_order_id bigint;
  v_alias_id bigint;
  v_line_item_online_store_id bigint;
begin
  insert into online_stores (name, slug, vendor_team_tag)
  values ('__test_store_7', '__test-store-7', '__test_store_7_primary')
  returning id into v_store_id;

  insert into online_store_vendor_tag_aliases (online_store_id, tag)
  values (v_store_id, '__test_store_7_alias')
  returning id into v_alias_id;

  insert into shopify_orders (shopify_order_id, source)
  values (-900000701, 'webhook')
  returning id into v_order_id;

  insert into shopify_order_line_items (order_id, shopify_line_item_id, team_tag, online_store_id)
  values (v_order_id, -900000701, '__test_store_7_alias', v_store_id);

  delete from online_store_vendor_tag_aliases where id = v_alias_id;

  select online_store_id into v_line_item_online_store_id
  from shopify_order_line_items where shopify_line_item_id = -900000701;

  if v_line_item_online_store_id is distinct from v_store_id then
    raise exception 'FAIL (test 7): removing an alias must not change an already-associated line item''s online_store_id';
  end if;

  raise notice 'PASS: test 7 (removing an alias never remaps already-associated line items)';
end $$;

rollback;
