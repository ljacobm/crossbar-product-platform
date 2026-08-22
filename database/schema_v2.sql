-- Crossbar Product Platform - Schema V2

drop table if exists shopify_webhook_events cascade;
drop table if exists shopify_order_line_items cascade;
drop table if exists shopify_orders cascade;
drop table if exists shopify_customers cascade;
drop table if exists online_store_payouts cascade;
drop table if exists online_stores cascade;
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

-- Shopify sales/customer data module. online_stores is the canonical table
-- for what the product roadmap calls "Team Stores" -- a team/organization's
-- storefront. It is deliberately the same real-world entity, not a
-- parallel concept: a Shopify order line item's Vendor "team_tag" resolves
-- to a row here, and any future Team Store Manager (roster management,
-- branding, order tracking, analytics) is expected to be built directly on
-- this table. Do not introduce a separate team_stores table later.
--
-- Naming rule: shopify_<thing>_id is an actual Shopify-assigned ID
-- (external/natural key), never a foreign key to a row in this database.
-- <thing>_id (no shopify_ prefix) is an internal foreign key to another
-- table's id column here (customer_id, order_id, catalog_product_id,
-- online_store_id).
--
-- SECURITY: shopify_customers, shopify_orders, shopify_order_line_items,
-- and shopify_webhook_events hold real customer PII (email, phone,
-- shipping/billing addresses, order notes, personalization properties).
-- Row Level Security is enabled on all five tables in this section with
-- zero policies defined, making them completely inaccessible to the anon
-- and authenticated roles (no policy = deny by default) -- i.e.
-- unreachable through the app's normal anon Supabase client
-- (lib/supabase.ts). The service-role client (lib/supabase-admin.ts)
-- bypasses RLS entirely, so the future verified Shopify webhook can still
-- read/write normally. See docs/decisions.md.
create table online_stores (
  id bigserial primary key,
  name text not null,
  slug text unique,
  -- Parsed Shopify Vendor "team_tag" portion (e.g. "North Cheektowaga
  -- Amateur Athletic Association"), used to map incoming line items to
  -- this store. Deliberately separate from `name`: the curated display
  -- name and the raw Vendor string are not guaranteed to always match
  -- (renames, typo cleanup, etc.), so matching must key off this column,
  -- never off `name`.
  vendor_team_tag text unique,
  active boolean default true,
  -- Fraction, not a whole number (0.20 = 20%). numeric(5,4) allows up to
  -- 999.99% at four decimal places of precision -- headroom for a future
  -- finer-grained rate (e.g. 0.1750), never a realistic constraint.
  fundraiser_rate numeric(5,4) not null default 0.20,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table shopify_customers (
  id bigserial primary key,
  shopify_customer_id bigint not null unique,
  email text,
  first_name text,
  last_name text,
  phone text,
  accepts_marketing boolean,
  orders_count integer,
  total_spent numeric(10,2),
  raw_data jsonb,
  first_seen_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table shopify_orders (
  id bigserial primary key,
  shopify_order_id bigint not null unique,
  order_number text,
  customer_id bigint references shopify_customers(id) on delete set null,
  email text,
  phone text,
  financial_status text,
  fulfillment_status text,
  currency text,
  subtotal_price numeric(10,2),
  total_tax numeric(10,2),
  total_discounts numeric(10,2),
  total_shipping numeric(10,2),
  total_refunded numeric(10,2),
  total_price numeric(10,2),
  customer_note text,
  shipping_method text,
  shipping_address jsonb,
  billing_address jsonb,
  source_name text,
  landing_site text,
  referring_site text,
  order_created_at timestamptz,
  order_updated_at timestamptz,
  cancelled_at timestamptz,
  raw_data jsonb,
  source text, -- 'webhook' | 'historical_import' | 'zapier_backfill' | 'manual_import' -- set once at first insert, never overwritten by a later touch from any path
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- online_store_id intentionally lives on the line item, not the order --
-- see the comment block above this section.
create table shopify_order_line_items (
  id bigserial primary key,
  order_id bigint not null references shopify_orders(id) on delete cascade,
  shopify_line_item_id bigint not null unique,
  shopify_product_id bigint,
  shopify_variant_id bigint,
  catalog_product_id bigint references catalog_products(id) on delete set null,
  online_store_id bigint references online_stores(id) on delete set null,
  vendor text,
  team_tag text,
  item_number text,
  is_crossbar_addon boolean not null default false,
  title text,
  variant_title text,
  sku text,
  color text,
  size text,
  quantity integer not null default 1,
  current_quantity integer,
  price numeric(10,2),
  total_discount numeric(10,2),
  requires_shipping boolean,
  taxable boolean,
  fulfillment_status text,
  properties jsonb,
  properties_text text,
  raw_data jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Audit/replay-safety log: every webhook delivery is recorded here before
-- any parsing happens, so a failed processing step never loses data.
create table shopify_webhook_events (
  id bigserial primary key,
  shopify_webhook_id text not null unique,
  topic text not null,
  shop_domain text,
  payload jsonb not null,
  status text not null default 'received', -- received | processed | failed
  error_message text,
  order_id bigint references shopify_orders(id) on delete set null,
  received_at timestamptz default now(),
  processed_at timestamptz,
  created_at timestamp default now()
);

-- Fundraiser payout ledger -- an audit trail, not a running total. Every
-- check/credit is its own row; the fundraiser balance is always derived as
-- (fundraiser earned) - (sum of these rows) in application code, never
-- stored directly on online_stores. online_store_id cascades on delete
-- (unlike e.g. shopify_orders.customer_id) because a payout record is
-- meaningless without knowing which store it's for.
create table online_store_payouts (
  id bigserial primary key,
  online_store_id bigint not null references online_stores(id) on delete cascade,
  payout_date date not null,
  amount numeric(10,2) not null,
  payment_type text,
  reference text,
  notes text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Row Level Security: enabled, zero policies. See the SECURITY note above.
alter table online_stores enable row level security;
alter table shopify_customers enable row level security;
alter table shopify_orders enable row level security;
alter table shopify_order_line_items enable row level security;
alter table shopify_webhook_events enable row level security;
alter table online_store_payouts enable row level security;

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
create index idx_online_stores_active on online_stores(active);
create index idx_shopify_customers_email on shopify_customers(email);
create index idx_shopify_orders_customer on shopify_orders(customer_id);
create index idx_shopify_orders_financial_status on shopify_orders(financial_status);
create index idx_shopify_orders_created_at on shopify_orders(order_created_at);
create index idx_shopify_line_items_order on shopify_order_line_items(order_id);
create index idx_shopify_line_items_catalog_product on shopify_order_line_items(catalog_product_id);
create index idx_shopify_line_items_online_store on shopify_order_line_items(online_store_id);
create index idx_shopify_line_items_addon on shopify_order_line_items(is_crossbar_addon);
create index idx_shopify_line_items_shopify_product on shopify_order_line_items(shopify_product_id);
create index idx_shopify_line_items_shopify_variant on shopify_order_line_items(shopify_variant_id);
create index idx_shopify_webhook_events_topic on shopify_webhook_events(topic);
create index idx_shopify_webhook_events_status on shopify_webhook_events(status);
create index idx_shopify_webhook_events_order on shopify_webhook_events(order_id);
create index idx_online_store_payouts_store on online_store_payouts(online_store_id);
create index idx_online_store_payouts_date on online_store_payouts(payout_date);