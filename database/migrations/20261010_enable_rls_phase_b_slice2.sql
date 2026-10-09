-- Phase B, slice 2 of the post-Stage-1 RLS follow-up: enable Row Level
-- Security (zero public policies) on collections and collection_products.
-- Purely additive: no table, column, row, grant, or existing policy is
-- touched. No anon/authenticated policy is added -- same "enabled, zero
-- policies = deny by default" posture already used for the Shopify/
-- sales/staff_allowlist tables and for knowledge_resources/
-- product_resource_links in slice 1 (see docs/decisions.md).
--
-- DO NOT RUN YET. Every anon-client read of these two tables across the
-- Next.js app has been migrated to lib/collectionData.ts (supabaseAdmin,
-- gated by requireStaffSession()) and verified locally, but this
-- migration should only be applied after that code is deployed to
-- production and confirmed working there -- same sequencing as slice 1.
alter table collections enable row level security;
alter table collection_products enable row level security;
