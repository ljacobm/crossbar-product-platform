-- Migration: Add product image management fields to product_images
-- Supports Supabase Storage-backed uploads for Crossbar and bundle products
-- (hero/gallery/detail/lifestyle/mockup images) alongside existing supplier
-- imported image_url rows. Non-destructive: only adds columns/indexes.

alter table product_images add column if not exists storage_path text;
alter table product_images add column if not exists alt_text text;
alter table product_images add column if not exists caption text;

create index if not exists idx_product_images_product_type_sort
  on product_images(catalog_product_id, image_type, sort_order);
