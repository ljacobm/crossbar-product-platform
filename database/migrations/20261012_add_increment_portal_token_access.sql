-- Phase 4D, Slice 3 correction: atomic access-tracking increment for the
-- Customer Fundraising Portal. Purely additive: one new function, no
-- existing table, column, grant, or policy is touched.
--
-- ALREADY APPLIED IN PRODUCTION. This file is a backfilled record
-- matching what was actually created and verified live (anon_execute =
-- false, authenticated_execute = false, service_role_execute = true) --
-- kept in sync with production so the migrations directory has a
-- complete, accurate history, per the same practice already used for
-- database/migrations/20261009b_enable_rls_phase_b_slice1.sql. DO NOT
-- RUN -- re-running is harmless (CREATE OR REPLACE FUNCTION and the
-- REVOKE/GRANT statements are all idempotent-safe) but this file exists
-- for documentation, not execution.
--
-- This function does exactly one thing: bump access_count and set
-- last_accessed_at for one already-known token row id, atomically (a
-- single UPDATE statement -- Postgres applies `access_count =
-- access_count + 1` as one atomic read-modify-write at the row level,
-- so two concurrent calls for the same row can never race each other
-- into an under-count the way a separate SELECT-then-UPDATE from
-- application code could).
--
-- It does NOT alter token authorization state: it never SETs `active`,
-- `token_hash`, `expires_at`, or `online_store_id` -- only the two
-- analytics columns. A call to this function can never make an inactive
-- token active, extend an expiry, or change which store a token belongs
-- to. The WHERE clause additionally RE-CHECKS (reads, never writes)
-- active = true and the same not-expired condition
-- resolvePortalStoreId() already applied moments earlier -- defense in
-- depth: if a token were revoked or expired in the narrow window between
-- resolution and this tracking call, the UPDATE simply matches zero rows
-- instead of incrementing a now-invalid token's counter.
--
-- security invoker (explicit, not the implicit default left unstated):
-- the only caller is ever service_role, which already has full direct
-- access to this table via BYPASSRLS -- no privilege escalation is
-- needed or granted here, matching the same reasoning already applied
-- to rotate_online_store_portal_token in the Slice 1 migration.
-- search_path is pinned to empty with the table reference fully
-- schema-qualified, so this function cannot be tricked by a search_path
-- manipulation into resolving an identifier against an
-- attacker-controlled object. No dynamic SQL (no EXECUTE/format()) is
-- used anywhere in the body.
--
-- p_token_id is a plain internal row id. It is never supplied by a
-- client directly -- the only caller, lib/portalAccess.ts, passes the
-- id it already resolved from a successful, validated token-hash
-- lookup moments earlier in the same request. Nothing about this
-- function's signature or body accepts a token, a token hash, or a
-- store id.
create or replace function public.increment_portal_token_access(p_token_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.online_store_portal_tokens
  set access_count = access_count + 1,
      last_accessed_at = now()
  where id = p_token_id
    and active = true
    and (expires_at is null or expires_at > now());
$$;

-- Postgres grants EXECUTE on every new function to PUBLIC by default --
-- unlike tables, this is NOT something Supabase's own default-privilege
-- setup already excludes. Revoking explicitly here is the one grant in
-- this migration that actually matters, not just a defensive
-- redundancy. No RLS policy or table-level grant is added or changed by
-- this migration -- online_store_portal_tokens' existing privilege
-- state (RLS enabled, zero anon/authenticated policies, zero
-- anon/authenticated table/sequence grants, from the Slice 1 migration)
-- is untouched.
revoke all on function public.increment_portal_token_access(bigint) from public, anon, authenticated;
grant execute on function public.increment_portal_token_access(bigint) to service_role;
