# Architecture Decisions

Short-form decision log. Each entry is a choice that shaped how the catalog
tooling works today, plus the reasoning, so future changes don't
accidentally relitigate settled trade-offs without knowing why they were
made.

## Service-role key stays server-only

**Decision:** `lib/supabase-admin.ts` (service-role key) is only ever
imported inside a `"use server"` module, guarded by `import "server-only"`.
For product/catalog tables (no RLS yet, anon reads freely), Server
Components read directly via the anon-key client (`lib/supabase.ts`) and
mutations go through a co-located `actions.ts` Server Action. For tables
that are RLS-locked with zero anon/authenticated policies (the Shopify
sales/store module — see the entry below), there is no anon-readable path
at all, so a small dedicated `"use server"` **data** module (e.g.
`lib/onlineStoreData.ts`, `lib/onlineStoreSalesData.ts`) exports plain
async read functions that Server Components call directly during render —
not triggered by a form/client handler, just an ordinary `await` of a
Server Action-shaped function. This is a fully supported way to invoke a
`"use server"` export and keeps the key server-only exactly the same way a
mutation-triggered Server Action does.
**Why:** The service-role key bypasses all RLS/permission checks. Keeping
every path that touches it inside a `"use server"` file means the key
never reaches the client bundle — Next compiles such a module so only an
opaque server-callable reference (never the real function body or
anything it closes over) is ever included in client-side JavaScript. Every
mutation still goes through explicit server-side validation before
touching the database.

## Migrations are plain additive SQL, applied by hand

**Decision:** Each schema change is a small, dated, non-destructive SQL
file in `database/migrations/` (mostly `alter table ... add column if not
exists`), and `database/schema_v2.sql` is updated in lockstep as the
canonical full-schema reference. There is no migration runner or ORM.
**Why:** The agent building this app only has the Supabase REST API via the
service-role key — no direct Postgres connection, so it cannot execute
arbitrary DDL. Migrations are handed to the project owner to run in the
Supabase SQL editor. Keeping them additive-only (no drops/recreates)
limits the blast radius of a migration being applied at the wrong time.

## No Storage bucket creation from application code

**Decision:** The `product-images` bucket was provisioned once, manually
(dashboard or a one-off API call), never by app code.
**Why:** Creating or reconfiguring a Storage bucket is an infrastructure
decision with public/private and billing implications — it warrants an
explicit choice by the project owner rather than being silently created by
a feature branch.

## Public Storage bucket, not signed URLs

**Decision:** `product-images` is a public bucket; `image_url` is a stable
public URL.
**Why:** Product images are explicitly destined for public surfaces
(website, team stores) eventually, so there's no confidentiality reason to
pay the complexity/expiry cost of signed URLs.

## Storage path stored per-row, never derived by listing

**Decision:** Every uploaded image row stores its own `storage_path`
(`products/{catalog_product_id}/{uuid}.{ext}`). Deletion (single image,
or cascading from product deletion) reads `storage_path` values from the
database and removes exactly those objects.
**Why:** Avoids ever needing to list bucket contents to find "which files
belong to this product," which would be slower and racier as the bucket
grows.

## Single-hero enforcement is centralized

**Decision:** One function (`enforceSingleHero`) is the only place that
ever sets `image_type = 'hero'` after upload; it always demotes any other
active hero for that product first. Hero resolution for *display*
(workspace, catalog, bundle) is a separate, identical sort (hero first,
then `sort_order`, then `id`) used everywhere images are rendered.
**Why:** Having one write path and one read/sort algorithm means the
"exactly one hero" invariant can't drift between features that each
reimplement it slightly differently.

## Supplier-imported data is read-only, permanently

**Decision:** Supplier products, their images, and their variants cannot be
edited, archived out of existence, or permanently deleted through any of
the new tooling (product editor, image manager). Only `active` on the
parent `catalog_products` row can change.
**Why:** Supplier data is the output of an automated import pipeline
(`importers/import_sanmar.py`). Letting ad-hoc UI edits drift from what the
importer would produce on a re-run creates silent data inconsistency.

## Bundles are single-level (no nesting) for now

**Decision:** `product_bundle_items.child_catalog_product_id` may reference
a supplier or Crossbar product, never another bundle. Enforced server-side
in both create and update actions.
**Why:** Nested bundles multiply the complexity of quantity/hero/price
resolution (what does "hero image" mean for a bundle containing a bundle?)
without a clear near-term need. Keeping it flat keeps the resolution logic
in one non-recursive pass.

## Rich content is sanitized on write, not just on render

**Decision:** `sanitizeResourceHtml` (an allowlist via `sanitize-html`) runs
on the server before `content_html` is stored, not only when it's
rendered.
**Why:** Storing pre-sanitized content means every consumer of
`content_html` (viewer, print view, any future API) is safe by
construction, instead of every render site needing to remember to sanitize.

## `useActionState` dispatch must run inside a transition

**Decision:** Any component that builds `FormData` programmatically (not
via a native `<form action={...}>` submit) and calls the function returned
by `useActionState` wraps that call in `startTransition(() => action(fd))`.
**Why:** Calling it bare throws "called outside of a transition" at
runtime — React requires the dispatch to be transition-wrapped when it's
not triggered by native form submission. This was fixed once in
`ProductImageUploader` after shipping; the pattern should be followed by
any future component with the same shape (multi-file or otherwise complex
client-built `FormData`).

## Category is free text, not a fixed dropdown, in the product editor

**Decision:** The common product editor uses a plain text input for
category rather than a hardcoded `<select>` of options.
**Why:** Real category values already vary widely across supplier-imported
products (`T-Shirts`, `Activewear`, ...), Crossbar categories, and bundle
categories. A fixed option list would either not match existing data or
require constant maintenance as new supplier categories appear.

## Shopify sales/customer tables have RLS enabled with zero policies

**Decision:** `online_stores`, `shopify_customers`, `shopify_orders`,
`shopify_order_line_items`, `shopify_webhook_events`, and
`online_store_payouts` (added in the Phase 4B migration) have Postgres Row
Level Security enabled (`alter table ... enable row level security`) with
no policies defined for `anon` or `authenticated`, in the migration itself
— not just as a documented convention to remember. No policy means deny by
default, so these tables are actually unreachable through the anon-key
Supabase client (`lib/supabase.ts`) at the database level, regardless of
what application code does. The service-role client
(`lib/supabase-admin.ts`) bypasses RLS entirely (standard Postgres/Supabase
behavior for that role).

This is no longer a schema-only, not-yet-consumed decision: the live
`orders/create` webhook, the historical GraphQL importer, the `/stores`
navigation (Phase 4A), and the store Sales Data dashboard (Phase 4B) all
read/write these tables today, exclusively via dedicated `"use server"`
data modules that import `supabaseAdmin` and are called directly from
Server Components/Server Actions (see the "Service-role key stays
server-only" entry above). **No anon/authenticated RLS policy has ever
been added to any of these six tables** — that was a live option
considered and explicitly rejected for `online_stores` during Phase 4A in
favor of the server-only data-module pattern, specifically so the same
approach would already be proven out and ready to reuse for the genuinely
sensitive tables in Phase 4B, rather than normalizing "just add a policy"
as the easy path.
**Why:** These tables hold real customer PII — email, phone, shipping/
billing addresses, order notes, and line-item personalization properties.
The rest of this schema tolerates "no RLS yet, anon key reads freely" as
an accepted gap for product-catalog data (see "Row Level Security
policies" in `docs/roadmap.md`), but that same default left open here
would make customer PII queryable by anyone holding the public anon key.
Enforcing this at the database layer (not just "don't write code that
does this") means the guarantee holds even if a future engineer forgets
the rule — there's no anon/authenticated policy to accidentally rely on
until one is deliberately added. This module is internal-only by design;
a future customer/store-manager portal will need its own explicit
authentication/authorization design before any of these tables become
reachable by anything other than a server-only module holding the
service-role key.

## `online_stores` is the canonical entity for the future Online Store Manager / Creator 3.0 system

**Decision:** `online_stores` is not a placeholder or a stopgap — it is
the permanent, canonical table for what Team Store Creator 2.0 calls a
store today and what Online Store Creator 3.0 will manage going forward.
A Shopify order line item's parsed Vendor `team_tag` resolves to a row
here (`shopify_order_line_items.online_store_id`), and every future
store-facing feature (Catalog/product selection, Fundraising, Payments/
Credits, Logos/Artwork, Requests, Settings, Shopify publishing, and an
eventual read-only customer/store-manager portal) is expected to be built
directly on this table via additive columns/related tables. **Do not
introduce a separate `team_stores` table, a duplicate store entity, or a
hard-coded store list later** — extend `online_stores` and its related
tables instead.
**Why:** This was decided at the outset of the Shopify sales module
(Phase 1) specifically to prevent a predictable future mistake: building
a "real" store table for Creator 3.0 later and ending up with two
competing definitions of "store" that drift out of sync. Phases 4A/4B
have since built real, live features (navigation, sales reporting,
fundraiser accounting) directly on `online_stores`, which makes it more
costly to introduce a competing entity now than it would have been
earlier — reaffirming this as settled, not open for revisiting.

## Store sales figures are computed from line items, never order totals

**Decision:** Every store-level sales metric (Total Sales, Total Items,
Fundraiser Earned, the detailed sales ledger, best sellers) is computed
from `shopify_order_line_items` rows matching `online_store_id = <store>`
— specifically `SUM(price * quantity)` for sales and `SUM(quantity)` for
items — and **never** reads `shopify_orders.total_price`,
`subtotal_price`, or any other order-level total.
**Why:** A single Shopify order can contain line items from multiple
different stores plus Crossbar Athletics add-ons in the same checkout
(a customer buying gear for two different teams' stores at once, for
example). An order-level total conflates all of that into one number with
no way to attribute it back to a single store; only summing the
individual matching line items gives a correct per-store figure. Cancelled
orders (`shopify_orders.cancelled_at is not null`) are excluded from all
of these sums. Partial refunds are **not** currently deducted
proportionally from line-item sales — a deliberate, documented V1
limitation (see `docs/roadmap.md`), not an oversight.

## Fundraiser payouts are an audit-style ledger, never a running total

**Decision:** `online_store_payouts` records one row per individual
payment/check/credit issued to a store. `online_stores` has no
"amount paid" or "balance" column of its own — the fundraiser balance is
always computed at read time as
`(lifetime Total Sales × online_stores.fundraiser_rate) − SUM(online_store_payouts.amount)`,
never stored directly.
**Why:** A stored running total can silently drift from reality (a manual
edit, a missed update, a race between two writers) with no way to audit
how it got that way. Deriving the balance from an append-only ledger of
individual payout records means the number is always reconstructable and
auditable from source data, matching how the existing manual Google Sheet
process already tracks individual checks. `fundraiser_rate` lives on
`online_stores` as `numeric(5,4)` (a fraction like `0.20`, not a whole
number `20`) since the rate is expected to vary by store over time; it
defaults to `0.20` for every existing and new store.

## Shopify order ingestion shares one normalizer between the webhook and the historical importer

**Decision:** Both the live `orders/create` webhook (REST payload shape)
and the historical GraphQL Admin API importer normalize into one shared
canonical shape (`NormalizedShopifyOrder` in `lib/shopifyNormalized.ts`)
before any database write happens. `lib/shopifyRestAdapter.ts` and
`lib/shopifyGraphQLAdapter.ts` each translate their respective source
shape (REST JSON vs. GraphQL nodes — global IDs, `MoneyBag` objects,
`customAttributes` vs. `properties`, etc.) into that one canonical shape;
`lib/shopifyNormalized.ts`'s `upsertNormalizedOrder()` is the **only**
place that actually writes to `shopify_customers`/`shopify_orders`/
`shopify_order_line_items` — vendor parsing, Crossbar add-on detection,
online-store matching, and the `source`-preservation rule (below) all live
there exactly once.
**Why:** REST and GraphQL genuinely return different shapes for the same
conceptual order, and forcing GraphQL data through REST-shaped fake
objects (or vice versa) would be fragile. Two independent normalizers
would each reimplement the same business rules and drift apart over time.
One canonical shape plus two small source-specific adapters means the
business logic can never diverge between "order arrived live" and "order
was backfilled."

## An order's `source` is set once, at first insert, and never overwritten

**Decision:** `shopify_orders.source` (`'webhook' | 'historical_import' |
'zapier_backfill' | 'manual_import'`) records how an order was *first*
ingested into this database. `upsertNormalizedOrder()` only sets `source`
on the initial insert; if the order already exists, every field is
updated except `source`, regardless of which ingestion path (webhook or
historical importer) does the touching.
**Why:** Without this rule, a historical backfill re-run touching an order
the live webhook already ingested would overwrite `source = 'webhook'`
with `'historical_import'` (or vice versa for a later webhook update to a
backfilled order), destroying a genuinely useful piece of provenance for
no reason. Mirrors the same "set once, preserve forever" pattern already
used for `shopify_customers.first_seen_at`.
