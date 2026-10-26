-- Second corrective patch for database/migrations/20261026_add_shopify_order_lifecycle_sync.sql,
-- already applied (with the first correction, 20261027, also already
-- applied) to the "Crossbar OS Staging" Supabase project.
--
-- BUG: claim_shopify_sync_checkpoint() RETURNS TABLE(job_name text,
-- pagination_cursor text, ..., status text, params_fingerprint text,
-- fingerprint_matches boolean) -- which implicitly declares `job_name`
-- (among others) as an OUT-parameter variable in scope for the whole
-- function body. Its INSERT's `ON CONFLICT (job_name)` target-column
-- list is parsed as a general expression list, not a restricted
-- column-names-only list (Postgres allows expression-based unique
-- indexes, so the conflict target grammar has to support arbitrary
-- expressions) -- meaning the bare `job_name` there is just as subject
-- to plpgsql variable-shadowing ambiguity as a WHERE/RETURNING/SELECT
-- reference would be. Confirmed in staging as:
--   ERROR: 42702: column reference "job_name" is ambiguous
--   Function: public.claim_shopify_sync_checkpoint(text,text,text,integer)
--
-- This is a DIFFERENT grammar position than the previous ambiguity fix
-- (20261027), which was a bare RETURNING clause -- an important
-- correction to that fix's own reasoning: a plain INSERT's OWN
-- target-column list (e.g. `insert into t (a, b, c)`) genuinely IS
-- restricted, column-names-only grammar and is NOT subject to this
-- ambiguity (confirmed: none of the other five ON CONFLICT clauses in
-- the original migration -- on shopify_customers, shopify_orders (x2),
-- shopify_fulfillments, shopify_refunds -- collide with their own
-- function's RETURNS TABLE column names, and none of them have ever
-- errored). Only ON CONFLICT's target list turned out to share that
-- expression-parsed status with WHERE/RETURNING/SELECT. Every WHERE,
-- RETURNING, ON CONFLICT, and RETURNS TABLE column across all seven
-- functions in the migration was re-inspected against this corrected
-- understanding; this is the only remaining instance of the bug.
--
-- FIX: name the conflict target by its backing unique constraint
-- (shopify_sync_checkpoints_job_name_key -- Postgres's standard
-- auto-generated name for the inline `unique` constraint on job_name
-- declared in that table's CREATE TABLE) instead of by column list. A
-- constraint name is resolved by catalog lookup only, never treated as
-- a value expression, so it can never collide with a plpgsql variable
-- regardless of naming. Functionally identical conflict target --
-- `job_name` is the sole column backing that constraint.
--
-- SAFE TO RUN IN STAGING NOW: this patch only CREATE OR REPLACEs the
-- one affected function. It does not drop or alter any table, does not
-- touch any row of data, and does not change RLS. CREATE OR REPLACE
-- FUNCTION preserves a function's existing ownership and granted
-- privileges automatically -- the REVOKE/GRANT below is restated
-- anyway, for explicitness.
--
-- This fix has also been applied directly to
-- database/migrations/20261026_add_shopify_order_lifecycle_sync.sql, so
-- a future fresh install never hits this bug and does not need this
-- patch file at all.
begin;

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
  -- FIXED: was `on conflict (job_name)` (bare column-list target,
  -- ambiguous against this function's own RETURNS TABLE(job_name, ...)
  -- OUT parameter) -- now targets the backing constraint by name.
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

commit;
