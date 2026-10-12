-- Phase 4D, Slice 1: Customer Fundraising Portal -- token storage
-- foundation. Purely additive: one new table, one new function, no
-- existing table/column/policy/grant is touched. No public portal route
-- or token resolver exists yet -- this slice only prepares the database
-- and staff-only Server Actions that manage tokens; nothing created here
-- is reachable by anyone outside staff login.
--
-- DO NOT RUN YET. Staged for review alongside the Slice 1 code changes.

create table if not exists public.online_store_portal_tokens (
  id bigserial primary key,
  online_store_id bigint not null references public.online_stores(id) on delete cascade,
  -- SHA-256 hex digest of the raw token -- the raw token itself is never
  -- stored anywhere, only this hash. Fixed-length lowercase hex, enforced
  -- by this check constraint rather than trusted from the caller.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_accessed_at timestamptz,
  access_count bigint not null default 0
);

-- At most one active token per store -- a partial unique index, not a
-- plain unique constraint, so a store can accumulate revoked/rotated
-- tokens in its history without ever conflicting with the current one.
create unique index if not exists online_store_portal_tokens_one_active_per_store
  on public.online_store_portal_tokens (online_store_id)
  where active = true;

-- General store-association lookup (status/history queries not filtered
-- to active = true specifically).
create index if not exists online_store_portal_tokens_store_id_idx
  on public.online_store_portal_tokens (online_store_id);

-- Row Level Security: enabled immediately, zero anon/authenticated
-- policies -- same posture as every other sensitive table in this
-- schema. Only supabaseAdmin (service_role), inside staff-session-gated
-- Server Actions, ever reads or writes this table.
alter table public.online_store_portal_tokens enable row level security;

-- Explicit privilege revocation -- defense in depth on top of RLS. RLS
-- governs SELECT/INSERT/UPDATE/DELETE row-by-row, but does not govern
-- TRUNCATE, and a future permissive policy added by mistake would be
-- immediately exploitable if the underlying table-level grant were still
-- sitting there unused. Revoking now means that can't happen silently.
-- PUBLIC is included even though Postgres does not grant table
-- privileges to PUBLIC by default for a newly created table -- explicit
-- and harmless either way.
revoke all privileges on public.online_store_portal_tokens from public, anon, authenticated;
revoke all privileges on public.online_store_portal_tokens_id_seq from public, anon, authenticated;

-- Nothing above or below changes service_role's access -- it already has
-- full access to this table via BYPASSRLS, the same as every other
-- table in this schema. This migration grants it nothing new.

-- Atomic token rotation. Wraps "lock the parent store", "deactivate the
-- current active token", and "insert the replacement" in a single
-- function call, which Postgres executes as one implicit transaction.
--
-- The SELECT ... FOR UPDATE on online_stores is what actually serializes
-- concurrent rotation attempts for the same store: a second concurrent
-- call blocks on *that* lock (held for the whole transaction) rather
-- than on the later UPDATE of a specific token row. Under the earlier
-- version of this function (without this lock), two concurrent calls
-- could both pass their own row-level checks and race to INSERT,
-- relying on the partial unique index to reject the loser with a raw
-- constraint-violation error. With the lock, the second call blocks
-- here until the first commits, then proceeds against the first call's
-- already-committed result -- both calls succeed cleanly, fully
-- serialized, never racing. The partial unique index remains in place
-- as a second, independent safety net regardless.
--
-- The same SELECT also serves as the store-existence check: a missing
-- store means no row to lock, so v_store_id stays null and an explicit
-- exception is raised before any token row is touched.
--
-- security invoker (the default -- stated explicitly for clarity), not
-- security definer: the only caller is ever service_role, which already
-- has full direct access to this table. A security definer function
-- would run with the function OWNER's privileges regardless of caller,
-- widening the blast radius of any bug in this function for no benefit
-- here -- there is no lower-privileged role this function needs to act
-- on behalf of. search_path is pinned to empty with every reference
-- fully schema-qualified, so this function cannot be tricked by a
-- search_path manipulation into resolving an identifier against an
-- attacker-controlled object.
create or replace function public.rotate_online_store_portal_token(
  p_online_store_id bigint,
  p_token_hash text,
  p_expires_at timestamptz default null
)
returns table (id bigint, created_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store_id bigint;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash format';
  end if;

  select s.id into v_store_id
  from public.online_stores as s
  where s.id = p_online_store_id
  for update;

  if v_store_id is null then
    raise exception 'online store % does not exist', p_online_store_id;
  end if;

  update public.online_store_portal_tokens
  set active = false
  where online_store_id = p_online_store_id
    and active = true;

  return query
  insert into public.online_store_portal_tokens as t (online_store_id, token_hash, expires_at)
  values (p_online_store_id, p_token_hash, p_expires_at)
  returning t.id, t.created_at;
end;
$$;

-- Postgres grants EXECUTE on every new function to PUBLIC by default --
-- unlike tables, this is NOT something Supabase's own default-privilege
-- setup already excludes. Revoking explicitly here is the one grant in
-- this migration that actually matters, not just a defensive redundancy.
revoke all on function public.rotate_online_store_portal_token(bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.rotate_online_store_portal_token(bigint, text, timestamptz) to service_role;
