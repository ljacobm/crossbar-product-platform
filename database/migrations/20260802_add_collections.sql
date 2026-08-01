-- Collections Milestone 1: reusable groups of approved Crossbar products.
-- Purely additive, no existing table/column/row touched.

create table if not exists collections (
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

-- A product may belong to multiple collections. Deleting a collection only
-- removes these join rows -- catalog_products is never touched. Deleting a
-- catalog_product (permanent delete, Crossbar/bundle only) correctly
-- cascades its collection memberships away too.
create table if not exists collection_products (
  id bigserial primary key,
  collection_id bigint references collections(id) on delete cascade,
  catalog_product_id bigint references catalog_products(id) on delete cascade,
  sort_order integer default 0,
  created_at timestamp default now(),
  unique (collection_id, catalog_product_id)
);

create index if not exists idx_collections_active on collections(active);
create index if not exists idx_collections_slug on collections(slug);
create index if not exists idx_collection_products_collection on collection_products(collection_id);
create index if not exists idx_collection_products_product on collection_products(catalog_product_id);
