-- Crossbar Product Platform - Schema V2

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
  display_name text not null,
  description_html text,
  crossbar_category text,
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
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique (supplier_id, supplier_style)
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

insert into suppliers (name, code)
values ('SanMar', 'SAN')
on conflict (code) do nothing;

create index idx_supplier_products_style on supplier_products(supplier_style);
create index idx_supplier_products_catalog_product on supplier_products(catalog_product_id);
create index idx_product_variants_catalog_product on product_variants(catalog_product_id);
create index idx_product_variants_supplier_product on product_variants(supplier_product_id);
create index idx_product_variants_color_size on product_variants(color_name, size_name);
create index idx_product_images_catalog_product on product_images(catalog_product_id);
create index idx_catalog_settings_show on catalog_settings(show_on_website);