-- Migration: Add resource library fields to knowledge_resources
-- Supports the full Operations Resource Library (search, filtering, ownership,
-- estimated time, and slugs for future shareable/print-friendly URLs).
-- Non-destructive: only adds columns/indexes to an existing table.

alter table knowledge_resources add column if not exists slug text unique;
alter table knowledge_resources add column if not exists updated_by text;
alter table knowledge_resources add column if not exists estimated_minutes integer;
alter table knowledge_resources add column if not exists department text;
alter table knowledge_resources add column if not exists owner_name text;

create index if not exists idx_knowledge_resources_slug on knowledge_resources(slug);
create index if not exists idx_knowledge_resources_department on knowledge_resources(department);
create index if not exists idx_knowledge_resources_active on knowledge_resources(active);
create index if not exists idx_knowledge_resources_updated_at on knowledge_resources(updated_at);
