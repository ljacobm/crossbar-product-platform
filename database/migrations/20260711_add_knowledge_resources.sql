-- Migration: Add knowledge resources and product resource links
-- Foundation for the future Operations module. Lets products link to reusable
-- operational/knowledge resources (SOPs, cut templates, artwork templates,
-- QC checklists, documents, videos, machine setup instructions).
-- This migration only adds new tables/indexes; it does not touch existing tables.

create table if not exists knowledge_resources (
  id bigserial primary key,
  resource_type text not null,
  title text not null,
  summary text,
  content_html text,
  version text,
  status text default 'Draft',
  file_url text,
  external_url text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists product_resource_links (
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

create index if not exists idx_knowledge_resources_resource_type on knowledge_resources(resource_type);
create index if not exists idx_knowledge_resources_status on knowledge_resources(status);
create index if not exists idx_product_resource_links_catalog_product on product_resource_links(catalog_product_id);
create index if not exists idx_product_resource_links_resource on product_resource_links(resource_id);
