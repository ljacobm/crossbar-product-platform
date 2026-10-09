-- Phase 4D Stage 1: staff authorization allowlist. Purely additive: one
-- new table, no changes to any existing table/column/policy.
--
-- A valid Supabase Auth session alone does not grant internal access.
-- requireStaffSession() (frontend/lib/auth.ts) checks BOTH that a request
-- has a valid Supabase Auth session AND that the session's user id has an
-- active row here. Staff accounts are created directly in Supabase Auth
-- (dashboard or a one-off admin script) and then added to this table --
-- there is no public sign-up path anywhere in the app.
create table if not exists staff_allowlist (
  -- References Supabase's own auth.users table (same Postgres database,
  -- auth schema). Deleting the Supabase Auth user cascades here too.
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  active boolean not null default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Row Level Security: enabled, zero anon/authenticated policies -- same
-- posture as every other sensitive table in this schema. Only
-- supabaseAdmin (service-role), inside requireStaffSession(), ever reads
-- this table.
alter table staff_allowlist enable row level security;
