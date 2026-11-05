-- One-time historical reconciliation: associate existing
-- shopify_order_line_items rows tagged "IroquoisFH" -- but not yet
-- associated with ANY store -- with online_stores.id = 72 (Iroquois
-- Field Hockey, slug iroquois-field-hockey, existing primary
-- vendor_team_tag "Iroquois Field Hockey").
--
-- This is a DATA fix, not a schema change -- deliberately kept separate
-- from database/migrations/20261105_add_online_store_vendor_tag_aliases.sql
-- (requirement: "separate schema migration, application deployment, and
-- historical data update into explicit steps"). Run this only AFTER:
--   1. The schema migration above has been applied.
--   2. The application has been deployed (so matchOnlineStores() in
--      frontend/lib/shopifyNormalized.ts recognizes aliases).
--   3. An alias row (online_store_id = 72, tag = 'IroquoisFH') has been
--      added -- either through the new "Shopify Vendor Tags" section on
--      the Iroquois Field Hockey store's Overview page, or directly:
--        insert into online_store_vendor_tag_aliases (online_store_id, tag, created_by)
--        values (72, 'IroquoisFH', 'reconciliation-script');
--      Step 3 is what makes FUTURE "IroquoisFH"-tagged orders match
--      automatically. It is NOT required for this script to run
--      correctly (the UPDATE below only ever sets online_store_id = 72
--      directly, regardless of whether the alias row exists yet), but
--      skipping it means only HISTORICAL rows get fixed -- any new
--      "IroquoisFH" order arriving before the alias exists would still
--      come in unmatched.
--
-- SCOPE, DELIBERATELY NARROW (per the approved requirements):
--   - Only team_tag = 'IroquoisFH', exact and case-sensitive. NOT
--     'IroquoisFH SandS' or any other variant -- that tag needs its
--     own, separately confirmed reconciliation and is untouched here.
--   - Only rows where online_store_id IS NULL right now. A line item
--     already associated with ANY store (72 or otherwise) is never
--     touched or remapped by this script.
--   - Only shopify_order_line_items.online_store_id is written. No
--     other column, table, order total, discount figure, fundraiser
--     calculation, or customer-facing data is read or modified.
--
-- IDEMPOTENT: safe to run any number of times. STEP 2's WHERE clause
-- (team_tag = 'IroquoisFH' AND online_store_id IS NULL) matches every
-- currently-unmatched row the first time it's run; every subsequent run
-- matches zero rows, since online_store_id is no longer NULL for any of
-- them, and is a pure no-op.
--
-- Run manually (psql or the Supabase SQL editor) against the target
-- database -- staging first, confirm STEP 3's count, then production,
-- as two separate, explicitly confirmed runs. Not executed automatically
-- by any script, migration, or CI step.

-- =====================================================================
-- STEP 1 -- PREVIEW (read-only). Run first; review the count and the
-- sample rows before running STEP 2.
-- =====================================================================
select count(*) as rows_to_reconcile
from shopify_order_line_items
where team_tag = 'IroquoisFH'
  and online_store_id is null;

select id, order_id, shopify_line_item_id, vendor, team_tag, online_store_id, created_at
from shopify_order_line_items
where team_tag = 'IroquoisFH'
  and online_store_id is null
order by id
limit 20;

-- =====================================================================
-- STEP 2 -- APPLY. The actual reconciliation. A single atomic UPDATE
-- statement (Postgres commits/rolls it back as one unit on its own --
-- no explicit BEGIN/COMMIT needed). Returns the number of rows changed.
-- =====================================================================
with updated as (
  update shopify_order_line_items
  set online_store_id = 72
  where team_tag = 'IroquoisFH'
    and online_store_id is null
  returning id
)
select count(*) as rows_reconciled from updated;

-- =====================================================================
-- STEP 3 -- VERIFY (read-only). Confirm zero rows remain unmatched for
-- this exact tag, and spot-check that the Sales Data dashboard for
-- store 72 now reflects the reconciled orders (it will automatically --
-- salesCalculations.ts's buildStoreSalesData() queries only by
-- online_store_id, so no sales-calculation code needs to change).
-- =====================================================================
select count(*) as remaining_unmatched
from shopify_order_line_items
where team_tag = 'IroquoisFH'
  and online_store_id is null;

select count(*) as total_line_items_now_on_store_72
from shopify_order_line_items
where online_store_id = 72;
