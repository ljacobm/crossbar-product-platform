-- Catalog Curation / Product Lifecycle workflow fields.
-- catalog_settings already has `workflow_status text default 'Imported'`
-- (added but never used by any UI) — reused here instead of adding a
-- duplicate `catalog_status` column with the same meaning and default.
-- Only the five genuinely-missing columns are added below.

alter table catalog_settings
  add column if not exists website_ready boolean default false,
  add column if not exists team_store_enabled boolean default false,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamp,
  add column if not exists website_ready_at timestamp;

create index if not exists idx_catalog_settings_workflow_status
  on catalog_settings(workflow_status);

create index if not exists idx_catalog_settings_team_store
  on catalog_settings(team_store_enabled);

-- Backfill: every existing catalog product gets a catalog_settings row
-- (defaulting to 'Imported') so downstream counts/filters can rely on a
-- 1:1 join instead of treating "no row" as a special case.
insert into catalog_settings (catalog_product_id, workflow_status)
select cp.id, 'Imported'
from catalog_products cp
where not exists (
  select 1 from catalog_settings cs where cs.catalog_product_id = cp.id
)
on conflict (catalog_product_id) do nothing;
