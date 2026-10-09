-- Phase A: enable Row Level Security (zero public policies) on five
-- tables that currently have no RLS and, per the Stage 1 security
-- follow-up investigation, are not read through the anon-key client
-- anywhere in the Crossbar OS Next.js app or the Python supplier-sync
-- pipeline (both of which only ever touch these tables via the
-- service-role key, which bypasses RLS entirely). Purely additive: no
-- table, column, row, grant, or existing policy is touched. No
-- anon/authenticated policy is added -- same "enabled, zero policies =
-- deny by default" posture already used for the Shopify/sales/
-- staff_allowlist tables (see docs/decisions.md).
--
-- Confirmed via repository grep before this migration was written:
--   - price_rules, quote_requests, quote_request_items: zero references
--     anywhere in frontend/ or importers/ -- schema-only, not yet wired
--     into any feature.
--   - supplier_sync_runs, supplier_sync_changes: written only by the
--     Python supplier-sync pipeline (importers/sync_sanmar.py via
--     services/catalog_service.py), which authenticates with
--     SUPABASE_SERVICE_ROLE_KEY and therefore bypasses RLS entirely.
--
-- Before running this against the live project: run the inspection
-- queries in the accompanying report first and confirm (1) all five
-- tables exist with the expected RLS/policy/grant state, and (2) no
-- deployed integration outside this repository reads these tables with
-- the anon or authenticated key.
alter table price_rules enable row level security;
alter table quote_requests enable row level security;
alter table quote_request_items enable row level security;
alter table supplier_sync_runs enable row level security;
alter table supplier_sync_changes enable row level security;
