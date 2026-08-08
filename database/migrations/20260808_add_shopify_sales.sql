-- Shopify sales/customer data module (Phase 1: schema only).
-- Purely additive: no existing table, column, row, or constraint is dropped
-- or altered. Adds five new tables:
--   online_stores, shopify_customers, shopify_orders,
--   shopify_order_line_items, shopify_webhook_events
--
-- Naming rule used throughout this migration:
--   shopify_<thing>_id  -- an actual ID Shopify assigned (external/natural
--                           key), never a foreign key to a row in this DB.
--   <thing>_id           -- an internal foreign key to another table's `id`
--                           column in this database (customer_id, order_id,
--                           catalog_product_id, online_store_id).
--
-- Shopify order data will eventually arrive via a direct webhook
-- (replacing the current Zapier/Google Sheets ingestion), which is not
-- part of this migration -- this only creates the destination tables.
--
-- SECURITY: Row Level Security is enabled on all five tables below with
-- zero policies defined. This makes them completely inaccessible to the
-- anon and authenticated Postgres roles (no policy = deny by default) --
-- i.e. unreachable through the app's normal anon Supabase client
-- (lib/supabase.ts). The service-role client (lib/supabase-admin.ts)
-- bypasses RLS entirely, per Postgres/Supabase's standard behavior for
-- that role, so the future verified Shopify webhook can still read/write
-- normally. No anon/authenticated policies are added here; add them
-- deliberately later if/when a specific access path is designed.

-- online_stores is the canonical table for what the product roadmap calls
-- "Team Stores" -- a team/organization's storefront. It is deliberately the
-- same real-world entity, not a parallel concept: a Shopify order line
-- item's Vendor "team_tag" resolves to a row here, and any future Team
-- Store Manager (roster management, branding, order tracking, analytics)
-- is expected to be built directly on this table. Do not introduce a
-- separate team_stores table later -- if Team Store Manager needs more
-- fields, extend this table via a normal additive migration instead.
create table if not exists online_stores (
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
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists shopify_customers (
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

create table if not exists shopify_orders (
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
  source text, -- 'webhook' | 'zapier_backfill' | 'manual_import' -- tracks ingestion path during the Zapier/Sheets -> webhook cutover
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- online_store_id intentionally lives on the line item, not the order:
-- Vendor (and therefore team_tag) is a per-line-item field in Shopify, and
-- a single order can contain items for more than one team/store plus a
-- Crossbar Athletics add-on. Putting the store link at order level would
-- force a false one-store-per-order assumption.
create table if not exists shopify_order_line_items (
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
  -- true when vendor = 'Crossbar Athletics' (name/number add-ons etc).
  -- Retained for Crossbar's internal reporting but excluded from
  -- individual online-store manager sales reports via this flag.
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

-- Audit/replay-safety log: every webhook delivery is recorded here (full
-- raw payload) before any parsing happens, so a failed or not-yet-built
-- processing step never loses Shopify data. shopify_webhook_id (Shopify's
-- own delivery ID) is unique so a re-delivered webhook can be detected and
-- skipped rather than double-processed.
create table if not exists shopify_webhook_events (
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

-- Row Level Security: enabled, zero policies. See the SECURITY note above.
alter table online_stores enable row level security;
alter table shopify_customers enable row level security;
alter table shopify_orders enable row level security;
alter table shopify_order_line_items enable row level security;
alter table shopify_webhook_events enable row level security;

create index if not exists idx_online_stores_active on online_stores(active);
create index if not exists idx_shopify_customers_email on shopify_customers(email);
create index if not exists idx_shopify_orders_customer on shopify_orders(customer_id);
create index if not exists idx_shopify_orders_financial_status on shopify_orders(financial_status);
create index if not exists idx_shopify_orders_created_at on shopify_orders(order_created_at);
create index if not exists idx_shopify_line_items_order on shopify_order_line_items(order_id);
create index if not exists idx_shopify_line_items_catalog_product on shopify_order_line_items(catalog_product_id);
create index if not exists idx_shopify_line_items_online_store on shopify_order_line_items(online_store_id);
create index if not exists idx_shopify_line_items_addon on shopify_order_line_items(is_crossbar_addon);
create index if not exists idx_shopify_line_items_shopify_product on shopify_order_line_items(shopify_product_id);
create index if not exists idx_shopify_line_items_shopify_variant on shopify_order_line_items(shopify_variant_id);
create index if not exists idx_shopify_webhook_events_topic on shopify_webhook_events(topic);
create index if not exists idx_shopify_webhook_events_status on shopify_webhook_events(status);
create index if not exists idx_shopify_webhook_events_order on shopify_webhook_events(order_id);
