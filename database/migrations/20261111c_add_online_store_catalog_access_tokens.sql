-- Online Store Builder, Slice 3: customer-scoped catalog access tokens.
--
-- Deliberately a SEPARATE table from online_store_portal_tokens (the
-- existing Customer Fundraising Portal link), not a shared one with an
-- added "scope" column: the portal table enforces "at most one ACTIVE
-- token per store" via a partial unique index, and a store needs to be
-- able to hand out a sales-portal link and a catalog-builder link to
-- different audiences AT THE SAME TIME without either rotation
-- affecting the other. Same crypto/shape/rotation pattern as that
-- table (see 20261011_add_online_store_portal_tokens.sql), deliberately
-- NOT copying its later encrypted-retrievable-copy addition (Slice 4B)
-- -- out of scope for this phase; the raw token is shown to staff once,
-- at generation/rotation time, exactly as the portal link originally
-- worked before that addition.
--
-- This token is the customer's ONLY credential for the catalog
-- workspace -- per the task's explicit requirement, the store id in a
-- customer-facing URL is never trusted by itself; every catalog read/
-- write resolves the store id from this table via the token hash, the
-- same way lib/portalAccess.ts already resolves online_store_id from
-- online_store_portal_tokens.

create table if not exists public.online_store_catalog_access_tokens (
  id bigserial primary key,
  online_store_id bigint not null references public.online_stores(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_accessed_at timestamptz,
  access_count bigint not null default 0
);

create unique index if not exists online_store_catalog_access_tokens_one_active_per_store
  on public.online_store_catalog_access_tokens (online_store_id)
  where active = true;

create index if not exists online_store_catalog_access_tokens_store_id_idx
  on public.online_store_catalog_access_tokens (online_store_id);

alter table public.online_store_catalog_access_tokens enable row level security;

revoke all privileges on public.online_store_catalog_access_tokens from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_access_tokens_id_seq from public, anon, authenticated;

-- Atomic rotation -- identical locking/serialization rationale as
-- rotate_online_store_portal_token() (see that migration's own,
-- extensive comment): locks the parent online_stores row for the
-- duration of the transaction, so concurrent rotation attempts for the
-- same store serialize cleanly rather than racing on the partial
-- unique index.
create or replace function public.rotate_online_store_catalog_access_token(
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

  update public.online_store_catalog_access_tokens
  set active = false
  where online_store_id = p_online_store_id
    and active = true;

  return query
  insert into public.online_store_catalog_access_tokens as t (online_store_id, token_hash, expires_at)
  values (p_online_store_id, p_token_hash, p_expires_at)
  returning t.id, t.created_at;
end;
$$;

revoke all on function public.rotate_online_store_catalog_access_token(bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.rotate_online_store_catalog_access_token(bigint, text, timestamptz) to service_role;

-- Single-statement atomic "bump access stats" -- same shape as the
-- existing increment_portal_token_access() function (see
-- 20261012_add_increment_portal_token_access.sql), parameterized for
-- this table instead. Best-effort by design: the caller
-- (frontend/lib/onlineStoreCatalogAccess.ts) never lets a failure here
-- block or fail an actual catalog request.
create or replace function public.increment_online_store_catalog_access_token(p_token_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.online_store_catalog_access_tokens
  set access_count = access_count + 1,
      last_accessed_at = now()
  where id = p_token_id;
$$;

revoke all on function public.increment_online_store_catalog_access_token(bigint) from public, anon, authenticated;
grant execute on function public.increment_online_store_catalog_access_token(bigint) to service_role;
