-- Online Store Builder, Slice 1: the GLOBAL approved master catalog.
--
-- Crossbar curates ONE master list of SanMar styles that customers are
-- allowed to choose from, across every online store -- this table is
-- that list. It is deliberately separate from per-store selections
-- (see the Slice 2 migration, online_store_catalog_items/_baseline):
-- a style becomes eligible here once, then any number of stores can
-- offer it to their own customers.
--
-- References an EXISTING supplier_products row (one row per SanMar
-- style/item code, e.g. "PC54" -- see schema_v2.sql) rather than
-- duplicating any product data. supplier_product_id is NOT NULL: only
-- a style code that EXACT-MATCHED a real supplier_products.supplier_style
-- at import time is ever inserted here. An unmatched style code is
-- never stored as a row with no product to reference -- the importer
-- (frontend/lib/approvedCatalogStyleData.ts) reports unmatched codes
-- back to the admin instead, so staff can fix a typo or recognize the
-- style genuinely isn't in the catalog yet.
--
-- "Disable" is modeled as active = false (soft), never a delete, so a
-- style that's temporarily pulled still has history -- "remove" (per
-- the task's own wording, "add, disable, or remove catalog eligibility")
-- is a real DELETE of this row, which is still perfectly safe: it only
-- ever removes a row in THIS table, never anything under
-- supplier_products/catalog_products/product_variants.

create table if not exists public.approved_catalog_styles (
  id bigserial primary key,
  supplier_id bigint not null references public.suppliers(id) on delete cascade,
  supplier_product_id bigint not null references public.supplier_products(id) on delete cascade,
  -- The exact style code as matched (trimmed, as typed by the
  -- importer) -- kept as its own column (rather than only joining
  -- through supplier_products) so an import report can always show
  -- back exactly what the admin pasted in, even if supplier_products
  -- .supplier_style is later renamed for some unrelated reason.
  style_code text not null,
  active boolean not null default true,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A style can only be on the master list once.
  unique (supplier_product_id)
);

create index if not exists approved_catalog_styles_style_code_idx
  on public.approved_catalog_styles (style_code);
create index if not exists approved_catalog_styles_active_idx
  on public.approved_catalog_styles (active);

-- Row Level Security: enabled immediately, zero anon/authenticated
-- policies -- same posture as every other table in this schema (see
-- docs/decisions.md). Only supabaseAdmin (service_role), inside
-- staff-session-gated "use server" modules, ever reads or writes this
-- table; the customer-facing catalog route reads the APPROVED,
-- customer-scoped view of this data through its own token-gated
-- Server Action, never directly.
alter table public.approved_catalog_styles enable row level security;

revoke all privileges on public.approved_catalog_styles from public, anon, authenticated;
revoke all privileges on public.approved_catalog_styles_id_seq from public, anon, authenticated;
