-- Phase 1 (Team Store Tag Aliases): many-to-one Shopify vendor/team tag
-- support. Purely additive -- online_stores.vendor_team_tag and every
-- existing mapping it already holds are untouched; this migration adds
-- exactly one new table, two trigger functions/triggers (one per
-- direction of the cross-table conflict this introduces), and RLS.
--
-- NOT YET RUN -- no local Postgres/Supabase CLI or staging database
-- connection was available in the environment this was written in.
-- Apply manually (staging first, then production, as two explicit,
-- separately confirmed runs -- see the implementation report for the
-- full deployment order). Safe to re-run: every statement below is
-- `create table if not exists` / `create or replace function` /
-- `create trigger` guarded by a DROP-if-exists, so a second run is a
-- no-op rather than an error.
--
-- WHY A SEPARATE TABLE, NOT A WIDER vendor_team_tag:
-- online_stores.vendor_team_tag stays a single, unique column -- it
-- remains the PRIMARY tag, unchanged in meaning and in every existing
-- read path that already selects it directly (getOnlineStores/
-- getOnlineStoreById, the Overview page's "Vendor / Team Tag" field,
-- etc). Every ADDITIONAL tag that should also resolve to the same
-- store lives as its own row in the new table below -- a real
-- many-to-one relationship, not a delimited string packed into one
-- column.
--
-- GLOBAL UNIQUENESS INVARIANT (requirement: "protection against a tag
-- belonging to multiple stores"): a given tag string must resolve to
-- AT MOST ONE store, system-wide, whether it's used as a primary tag or
-- an alias. This is enforced at the database level, not just in
-- application code, via three mechanisms together:
--   1. online_stores.vendor_team_tag already has its own `unique`
--      constraint (pre-existing) -- no two stores can share a primary
--      tag.
--   2. online_store_vendor_tag_aliases.tag has a new `unique`
--      constraint below -- no two stores can share an alias, and the
--      same store cannot add the same alias twice.
--   3. Two new BEFORE INSERT OR UPDATE triggers close the remaining
--      gap -- preventing an alias from being set to any value already
--      used as SOME store's primary tag, and symmetrically preventing
--      a store's primary tag from being set/changed to any value
--      already claimed as another store's alias. Together, (1)+(2)+(3)
--      make "one tag -> at most one store" a database-enforced
--      invariant, not merely an application-level convention that a
--      direct SQL edit or a future code path could silently violate.
--
-- APPLICATION WIRING (frontend/lib/shopifyNormalized.ts's
-- matchOnlineStores(), updated in this same change set): looks up a
-- team tag against BOTH online_stores.vendor_team_tag AND this new
-- table and merges the results -- see that file's own comment for why
-- a primary-tag match is preferred over an alias match if the
-- (should-be-impossible, trigger-prevented) case of both existing for
-- the same tag is ever hit anyway.
--
-- AUDIT / INSPECTION (requirement: "audit-friendly way to inspect tag
-- mappings"): the staff Online Store settings page (Overview tab) now
-- shows a store's primary tag and every alias together, with who added
-- each alias and when (created_by/created_at below). For direct
-- database inspection, every tag (primary + aliases) associated with
-- one store is:
--   select vendor_team_tag as tag, 'primary' as tag_type
--   from online_stores where id = :store_id
--   union all
--   select tag, 'alias' from online_store_vendor_tag_aliases
--   where online_store_id = :store_id;
--
-- RLS: enabled, zero anon/authenticated policies -- the identical
-- posture already used for online_stores itself and every other
-- sensitive table in this schema (see 20261008_add_staff_allowlist.sql
-- and 20260808_add_shopify_sales.sql). Only supabaseAdmin
-- (service-role, which bypasses RLS entirely), called from "use
-- server" code paths guarded by requireStaffSession() (staff UI) or
-- used internally by the Shopify ingestion path, ever reads or writes
-- this table. There is no separate per-store staff permission tier
-- anywhere in this app (see lib/auth.ts) -- "authorized staff" here
-- means the same flat staff_allowlist membership every other internal
-- action already requires, nothing narrower.
--
-- HISTORICAL DATA: this migration does not touch
-- shopify_order_line_items or any other existing table/row. Associating
-- already-ingested, currently-unmatched line items with a store once an
-- alias exists is a separate, explicit, scoped reconciliation step --
-- see database/reconciliation/20261105_iroquoisfh_vendor_tag_alias.sql.

create table if not exists online_store_vendor_tag_aliases (
  id bigserial primary key,
  online_store_id bigint not null references online_stores(id) on delete cascade,
  -- Global uniqueness (see the invariant comment above): the same tag
  -- can never be an alias for two different stores, and the same store
  -- can never add the same alias twice.
  tag text not null,
  constraint online_store_vendor_tag_aliases_tag_not_blank check (btrim(tag) <> ''),
  constraint online_store_vendor_tag_aliases_tag_key unique (tag),
  -- Audit trail: which staff member added this alias, and when. Never
  -- surfaced outside the internal staff app.
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_online_store_vendor_tag_aliases_store
  on online_store_vendor_tag_aliases(online_store_id);

alter table online_store_vendor_tag_aliases enable row level security;

-- Direction 1: an alias cannot be set to a value already in use as
-- SOME store's primary vendor_team_tag (including the same store's own
-- primary tag -- that would just be a redundant, confusing duplicate of
-- the same mapping, not a legitimate second tag).
create or replace function public.check_vendor_tag_alias_no_conflict()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.online_stores where vendor_team_tag = new.tag
  ) then
    raise exception 'Tag "%" is already in use as a store''s primary vendor tag and cannot also be an alias', new.tag;
  end if;
  return new;
end;
$$;

revoke all on function public.check_vendor_tag_alias_no_conflict() from public, anon, authenticated;

drop trigger if exists trg_online_store_vendor_tag_aliases_no_conflict on online_store_vendor_tag_aliases;
create trigger trg_online_store_vendor_tag_aliases_no_conflict
before insert or update on online_store_vendor_tag_aliases
for each row execute function public.check_vendor_tag_alias_no_conflict();

-- Direction 2 (symmetric): a store's primary vendor_team_tag cannot be
-- set/changed to a value already claimed as a DIFFERENT store's alias.
-- (Its own aliases are irrelevant here by construction -- direction 1
-- above already guarantees no alias ever equals its own store's primary
-- tag, so this only ever needs to check other stores.)
create or replace function public.check_online_store_primary_tag_no_alias_conflict()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.vendor_team_tag is not null and exists (
    select 1 from public.online_store_vendor_tag_aliases
    where tag = new.vendor_team_tag and online_store_id <> new.id
  ) then
    raise exception 'Tag "%" is already in use as another store''s alias and cannot become a primary vendor tag', new.vendor_team_tag;
  end if;
  return new;
end;
$$;

revoke all on function public.check_online_store_primary_tag_no_alias_conflict() from public, anon, authenticated;

drop trigger if exists trg_online_stores_primary_tag_no_alias_conflict on online_stores;
create trigger trg_online_stores_primary_tag_no_alias_conflict
before insert or update on online_stores
for each row execute function public.check_online_store_primary_tag_no_alias_conflict();
