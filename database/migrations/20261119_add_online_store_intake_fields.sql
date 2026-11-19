-- Creator 3.0, Phase 1 (Store Provisioning): intake/contact fields for
-- online_stores. Purely additive -- no existing column is altered, and
-- every new column is nullable, so no backfill is needed for any
-- existing row. See docs/creator3-phase1-store-provisioning.md.
--
-- Deliberately does NOT add a customer-launch-readiness column (the
-- future "Internal Preparation -> Ready for Review -> Approved -> Live"
-- workflow) -- that is a distinct, separately scoped concept belonging
-- to whichever later phase implements Shopify publishing (see §1 of the
-- design doc). online_stores.active keeps its existing meaning
-- ("Crossbar staff can access/configure this store") and its existing
-- default (true) unchanged.
--
-- STAGING ONLY until explicitly approved for MAIN.

alter table public.online_stores
  add column if not exists organization_type text,
  add column if not exists sport text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists notes text;

-- No RLS change needed -- online_stores already has RLS enabled with
-- zero anon/authenticated policies; new columns on an existing table
-- inherit that automatically.
