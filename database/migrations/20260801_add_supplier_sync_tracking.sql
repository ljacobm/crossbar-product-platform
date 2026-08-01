-- Supplier sync tracking for the weekly SanMar synchronizer (importers/sync_sanmar.py).
-- Purely additive: no existing column, table, row, or constraint is dropped
-- or altered destructively.

-- Explicit supplier-facing status, distinct from the generic `active` flag
-- already on supplier_products. `active` continues to mean "should this
-- supplier_product/variant be treated as sellable right now" (and is what
-- the frontend and existing queries already check); `supplier_status` is
-- the human-readable reason, so a discontinued style/SKU can be identified
-- as such directly instead of only inferring it from `active = false`.
alter table supplier_products
  add column if not exists supplier_status text not null default 'Active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_products_supplier_status_check'
  ) then
    alter table supplier_products
      add constraint supplier_products_supplier_status_check
      check (supplier_status in ('Active', 'Discontinued'));
  end if;
end $$;

create index if not exists idx_supplier_products_supplier_status
  on supplier_products(supplier_status);

-- One row per sync script execution (dry-run or real), for history/troubleshooting.
create table if not exists supplier_sync_runs (
  id bigserial primary key,
  supplier_id bigint references suppliers(id),
  started_at timestamp default now(),
  completed_at timestamp,
  status text not null default 'running', -- running | completed | failed
  source_filename text,
  rows_processed integer default 0,
  products_new integer default 0,
  products_updated integer default 0,
  products_discontinued integer default 0,
  variants_new integer default 0,
  variants_updated integer default 0,
  variants_deactivated integer default 0,
  images_new integer default 0,
  images_updated integer default 0,
  errors_count integer default 0,
  summary_json jsonb,
  created_at timestamp default now()
);

-- Per-change detail rows for a sync run. Inventory-quantity changes are
-- intentionally NOT logged here one row per variant (that would produce
-- thousands of rows on a normal week) — they're aggregated into the parent
-- supplier_sync_runs.summary_json instead. Everything else tracked here is
-- comparatively rare and worth a durable, queryable row.
create table if not exists supplier_sync_changes (
  id bigserial primary key,
  sync_run_id bigint references supplier_sync_runs(id) on delete cascade,
  supplier_product_id bigint references supplier_products(id) on delete set null,
  catalog_product_id bigint references catalog_products(id) on delete set null,
  change_type text not null, -- New Product | Product Updated | Product Discontinued | Price Changed | Variant Added | Variant Deactivated | Image Added
  entity_type text not null, -- catalog_product | supplier_product | variant | image
  field_name text,
  old_value text,
  new_value text,
  created_at timestamp default now()
);

create index if not exists idx_supplier_sync_runs_supplier on supplier_sync_runs(supplier_id);
create index if not exists idx_supplier_sync_changes_run on supplier_sync_changes(sync_run_id);
create index if not exists idx_supplier_sync_changes_type on supplier_sync_changes(change_type);
create index if not exists idx_supplier_sync_changes_catalog_product on supplier_sync_changes(catalog_product_id);
