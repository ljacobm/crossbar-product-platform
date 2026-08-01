# Architecture Decisions

Short-form decision log. Each entry is a choice that shaped how the catalog
tooling works today, plus the reasoning, so future changes don't
accidentally relitigate settled trade-offs without knowing why they were
made.

## Service-role key stays server-only

**Decision:** `lib/supabase-admin.ts` (service-role key) is only ever
imported inside Server Actions (`"use server"` files), guarded by
`import "server-only"`. Server Components use the anon-key client
(`lib/supabase.ts`) for reads.
**Why:** The service-role key bypasses all RLS/permission checks. Keeping
every write path behind a Server Action means the key never reaches the
client bundle, and every mutation goes through explicit server-side
validation before touching the database.

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
