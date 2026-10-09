-- Phase B, slice 1 of the post-Stage-1 RLS follow-up: Row Level Security
-- (zero public policies) on knowledge_resources and
-- product_resource_links.
--
-- ALREADY APPLIED IN PRODUCTION. This file is a backfilled record of a
-- migration that was run directly against the live Supabase project from
-- the inline SQL provided during that slice's deployment review -- it was
-- never saved as a migration file at the time. Added here after the fact
-- so the migrations directory has a complete history alongside
-- database/schema_v2.sql, which already reflects this as enabled. DO NOT
-- RUN -- re-running is harmless (ENABLE ROW LEVEL SECURITY is a no-op if
-- already enabled) but this file exists for documentation, not execution.
--
-- Every anon-client read of these two tables was migrated to
-- lib/knowledgeResourceData.ts (supabaseAdmin, gated by
-- requireStaffSession()) before this was applied; see docs/decisions.md.
alter table knowledge_resources enable row level security;
alter table product_resource_links enable row level security;
