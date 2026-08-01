-- Crossbar Product Platform - Schema V2

drop table if exists collection_products cascade;
drop table if exists collections cascade;
drop table if exists supplier_sync_changes cascade;
drop table if exists supplier_sync_runs cascade;
drop table if exists product_resource_links cascade;
drop table if exists knowledge_resources cascade;
drop table if exists product_bundle_items cascade;
drop table if exists crossbar_product_data cascade;
drop table if exists quote_request_items cascade;
drop table if exists quote_requests cascade;
drop table if exists price_rules cascade;
drop table if exists catalog_settings cascade;
drop table if exists product_images cascade;
drop table if exists product_variants cascade;
drop table if exists supplier_products cascade;
drop table if exists catalog_products cascade;
drop table if exists suppliers cascade;

create table suppliers (
  id bigserial primary key,
  name text not null unique,
  code text not null unique,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table catalog_products (
  id bigserial primary key,
  crossbar_sku text unique,

  -- Product source
  source_type text not null default 'supplier',

  -- Customer-facing information
  display_name text not null,
  product_slug text unique,
  description_html text,
  crossbar_category text,

  -- Product characteristics
  brand_display text,
  material text,
  fabric text,
  fit text,
  gender text,
  age_group text,
  weight_class text,

  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table supplier_products (
  id bigserial primary key,
  supplier_id bigint references suppliers(id) on delete cascade,
  catalog_product_id bigint references catalog_products(id) on delete cascade,
  supplier_style text not null,
  supplier_title text,
  supplier_brand text,
  supplier_category text,
  supplier_description_html text,
  active boolean default true,
  supplier_status text not null default 'Active' check (supplier_status in ('Active', 'Discontinued')),
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique (supplier_id, supplier_style)
);

create table crossbar_product_data (
  id bigserial primary key,
  catalog_product_id bigint references catalog_products(id) on delete cascade unique,
  product_family text,
  production_method text,
  base_template text,
  default_size_range text,
  product_notes text,
  production_notes text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table product_bundle_items (
  id bigserial primary key,
  bundle_catalog_product_id bigint references catalog_products(id) on delete cascade,
  child_catalog_product_id bigint references catalog_products(id),
  quantity integer default 1,
  required boolean default true,
  sort_order integer default 0,
  created_at timestamp default now()
);

create table knowledge_resources (
  id bigserial primary key,
  resource_type text not null,
  title text not null,
  summary text,
  content_html text,
  version text,
  status text default 'Draft',
  file_url text,
  external_url text,
  slug text unique,
  updated_by text,
  estimated_minutes integer,
  department text,
  owner_name text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table product_resource_links (
  id bigserial primary key,
  catalog_product_id bigint references catalog_products(id) on delete cascade,
  resource_id bigint references knowledge_resources(id) on delete cascade,
  relationship_type text,
  required boolean default false,
  notes text,
  sort_order integer default 0,
  created_at timestamp default now(),
  unique (catalog_product_id, resource_id)
);

create table product_variants (
  id bigserial primary key,
  catalog_product_id bigint references catalog_products(id) on delete cascade,
  supplier_product_id bigint references supplier_products(id) on delete cascade,
  color_name text not null,
  size_name text not null,
  supplier_sku text not null unique,
  supplier_price numeric(10,2),
  inventory_qty integer,
  grams integer,
  weight_unit text,
  taxable boolean,
  requires_shipping boolean,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table product_images (
  id bigserial primary key,
  catalog_product_id bigint references catalog_products(id) on delete cascade,
  supplier_product_id bigint references supplier_products(id) on delete cascade,
  color_name text,
  image_url text not null,
  image_type text default 'product',
  storage_path text,
  alt_text text,
  caption text,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique (supplier_product_id, color_name, image_url)
);

create table catalog_settings (
  id bigserial primary key,
  catalog_product_id bigint references catalog_products(id) on delete cascade unique,
  show_on_website boolean default false,
  workflow_status text default 'Imported',
  website_ready boolean default false,
  team_store_enabled boolean default false,
  approved_by text,
  approved_at timestamp,
  website_ready_at timestamp,
  featured boolean default false,
  recommended boolean default false,
  website_category text,
  decoration_methods text,
  price_rule_code text,
  markup_percent numeric(8,2),

  -- Crossbar product knowledge
  internal_score integer,
  customer_facing_notes text,
  internal_notes text,
  recommended_uses text,
  fit_notes text,
  print_notes text,
  embroidery_notes text,

  notes text,
  sort_order integer,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table price_rules (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  rule_type text,
  markup_percent numeric(8,2),
  flat_markup numeric(10,2),
  minimum_price numeric(10,2),
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table quote_requests (
  id bigserial primary key,
  request_status text default 'New',
  customer_name text,
  customer_email text,
  customer_phone text,
  team_name text,
  deadline date,
  logo_file_url text,
  roster_file_url text,
  roster_notes text,
  general_notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table quote_request_items (
  id bigserial primary key,
  quote_request_id bigint references quote_requests(id) on delete cascade,
  catalog_product_id bigint references catalog_products(id),
  color_name text,
  size_quantities jsonb,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Collections: reusable groups of approved Crossbar products. Not Team
-- Stores. A product may belong to multiple collections; deleting a
-- collection never deletes products, only the membership rows.
create table collections (
  id bigserial primary key,
  name text not null,
  slug text unique,
  description text,
  sport text,
  season text,
  audience text,
  hero_image_url text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table collection_products (
  id bigserial primary key,
  collection_id bigint references collections(id) on delete cascade,
  catalog_product_id bigint references catalog_products(id) on delete cascade,
  sort_order integer default 0,
  created_at timestamp default now(),
  unique (collection_id, catalog_product_id)
);

-- One row per sync script execution (dry-run or real).
create table supplier_sync_runs (
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
-- aggregated into supplier_sync_runs.summary_json instead of one row per
-- variant, to avoid an unreasonable number of rows on a normal week.
create table supplier_sync_changes (
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

insert into suppliers (name, code)
values ('SanMar', 'SAN')
on conflict (code) do nothing;

create index idx_catalog_products_source_type on catalog_products(source_type);
create index idx_supplier_products_style on supplier_products(supplier_style);
create index idx_supplier_products_supplier_status on supplier_products(supplier_status);
create index idx_supplier_products_catalog_product on supplier_products(catalog_product_id);
create index idx_product_bundle_items_bundle on product_bundle_items(bundle_catalog_product_id);
create index idx_product_bundle_items_child on product_bundle_items(child_catalog_product_id);
create index idx_product_variants_catalog_product on product_variants(catalog_product_id);
create index idx_product_variants_supplier_product on product_variants(supplier_product_id);
create index idx_product_variants_color_size on product_variants(color_name, size_name);
create index idx_product_images_catalog_product on product_images(catalog_product_id);
create index idx_product_images_product_type_sort on product_images(catalog_product_id, image_type, sort_order);
create index idx_catalog_settings_show on catalog_settings(show_on_website);
create index idx_catalog_settings_workflow_status on catalog_settings(workflow_status);
create index idx_catalog_settings_team_store on catalog_settings(team_store_enabled);
create index idx_knowledge_resources_resource_type on knowledge_resources(resource_type);
create index idx_knowledge_resources_status on knowledge_resources(status);
create index idx_knowledge_resources_slug on knowledge_resources(slug);
create index idx_knowledge_resources_department on knowledge_resources(department);
create index idx_knowledge_resources_active on knowledge_resources(active);
create index idx_knowledge_resources_updated_at on knowledge_resources(updated_at);
create index idx_product_resource_links_catalog_product on product_resource_links(catalog_product_id);
create index idx_product_resource_links_resource on product_resource_links(resource_id);
create index idx_collections_active on collections(active);
create index idx_collections_slug on collections(slug);
create index idx_collection_products_collection on collection_products(collection_id);
create index idx_collection_products_product on collection_products(catalog_product_id);
create index idx_supplier_sync_runs_supplier on supplier_sync_runs(supplier_id);
create index idx_supplier_sync_changes_run on supplier_sync_changes(sync_run_id);
create index idx_supplier_sync_changes_type on supplier_sync_changes(change_type);
create index idx_supplier_sync_changes_catalog_product on supplier_sync_changes(catalog_product_id);