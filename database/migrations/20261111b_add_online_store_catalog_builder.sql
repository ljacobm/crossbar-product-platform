-- Online Store Builder, Slice 2: per-store catalog draft / approved
-- baseline / submission + review audit trail.
--
-- Four tables, deliberately kept separate rather than one table with a
-- status flag, so an in-progress customer edit can NEVER be confused
-- with, or accidentally overwrite, either the live approved baseline
-- or an already-submitted review snapshot:
--
--   online_store_catalog_items     -- the customer's current DRAFT.
--     Freely mutable; a customer toggling styles/colors writes here
--     and ONLY here. Never affects what's actually live for the store.
--
--   online_store_catalog_baseline  -- the current APPROVED/live set
--     for the store. Only ever changed by applying an approved
--     submission item (see below) -- never written to directly by
--     customer edits.
--
--   online_store_catalog_submissions        -- one frozen row per
--   online_store_catalog_submission_items   -- "submit for review"
--     click. submission_items is a snapshot of the ADDED/REMOVED diff
--     between the draft and the baseline AT THE MOMENT OF SUBMISSION --
--     captured once, then immutable except for the reviewer's own
--     decision/notes/timestamp columns. A customer continuing to edit
--     their draft after submitting can never retroactively change an
--     already-created submission row: there is no FK or trigger from
--     online_store_catalog_items back into these tables at all, so
--     nothing here can even see later draft edits, let alone be
--     overwritten by them.
--
-- A "color change" for a style is deliberately NOT a distinct
-- change_type -- it decomposes into one 'removed' row (the old color)
-- and one 'added' row (the new color) in submission_items, both at
-- the same (style, color) granularity as the draft/baseline tables
-- themselves. This keeps exactly one shape to review/approve/reject,
-- rather than a second, parallel "change" shape with its own rules.
--
-- Approval application (moving an approved submission_items row into
-- online_store_catalog_baseline) is application logic, not a database
-- trigger -- see decideCatalogSubmissionItem() in
-- frontend/lib/onlineStoreCatalogBuilderData.ts.
-- Keeping it in application code (rather than a PL/pgSQL trigger) matches
-- this project's existing split: triggers are used here only for
-- invariants that must hold regardless of which code path writes (see
-- the vendor-tag-alias conflict triggers), not for ordinary workflow
-- transitions, which this codebase always implements as explicit
-- Server Actions.

create table if not exists public.online_store_catalog_items (
  id bigserial primary key,
  online_store_id bigint not null references public.online_stores(id) on delete cascade,
  approved_catalog_style_id bigint not null references public.approved_catalog_styles(id) on delete cascade,
  color_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (online_store_id, approved_catalog_style_id, color_name)
);

create index if not exists online_store_catalog_items_store_idx
  on public.online_store_catalog_items (online_store_id);

create table if not exists public.online_store_catalog_baseline (
  id bigserial primary key,
  online_store_id bigint not null references public.online_stores(id) on delete cascade,
  approved_catalog_style_id bigint not null references public.approved_catalog_styles(id) on delete cascade,
  color_name text not null,
  approved_at timestamptz not null default now(),
  approved_by text,
  -- Future-Shopify-integration status, per task requirement 8 -- design
  -- the statuses now, implement NO publishing logic at all. Nothing in
  -- this codebase ever sets this to 'published' automatically; that
  -- transition is explicitly out of scope for this phase.
  shopify_publish_status text not null default 'pending_decoration'
    check (shopify_publish_status in (
      'pending_decoration', 'pending_mockup', 'pending_pricing', 'ready_to_publish', 'published'
    )),
  unique (online_store_id, approved_catalog_style_id, color_name)
);

create index if not exists online_store_catalog_baseline_store_idx
  on public.online_store_catalog_baseline (online_store_id);

create table if not exists public.online_store_catalog_submissions (
  id bigserial primary key,
  online_store_id bigint not null references public.online_stores(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  submitted_by text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'partially_approved')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text
);

create index if not exists online_store_catalog_submissions_store_idx
  on public.online_store_catalog_submissions (online_store_id);
create index if not exists online_store_catalog_submissions_status_idx
  on public.online_store_catalog_submissions (status);

create table if not exists public.online_store_catalog_submission_items (
  id bigserial primary key,
  submission_id bigint not null references public.online_store_catalog_submissions(id) on delete cascade,
  approved_catalog_style_id bigint not null references public.approved_catalog_styles(id) on delete cascade,
  color_name text not null,
  change_type text not null check (change_type in ('added', 'removed')),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  decision_notes text,
  decided_by text,
  decided_at timestamptz,
  unique (submission_id, approved_catalog_style_id, color_name, change_type)
);

create index if not exists online_store_catalog_submission_items_submission_idx
  on public.online_store_catalog_submission_items (submission_id);

-- RLS: enabled, zero policies, same posture as every table above.
-- Customer-facing access (draft read/write) goes through its own
-- token-gated Server Action module, service_role throughout -- never
-- a direct anon/authenticated grant or policy.
alter table public.online_store_catalog_items enable row level security;
alter table public.online_store_catalog_baseline enable row level security;
alter table public.online_store_catalog_submissions enable row level security;
alter table public.online_store_catalog_submission_items enable row level security;

revoke all privileges on public.online_store_catalog_items from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_items_id_seq from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_baseline from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_baseline_id_seq from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_submissions from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_submissions_id_seq from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_submission_items from public, anon, authenticated;
revoke all privileges on public.online_store_catalog_submission_items_id_seq from public, anon, authenticated;
