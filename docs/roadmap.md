# Roadmap

This tracks what Crossbar OS's catalog/operations tooling actually does
today versus what's intentionally deferred. See `CHANGELOG.md` for
session-by-session detail; this file groups the same work by theme and
looks forward.

## Shipped

- **Product Catalog Foundation** — SanMar supplier import, normalization,
  searchable/filterable catalog list, product workspace with hero image,
  color/size variant table, supplier pricing and inventory.
- **Crossbar Product Creation & Lifecycle** — in-house product creation,
  archive/restore, permanent delete (with bundle-reference protection),
  source-aware product editor (common fields + Crossbar-only fields +
  read-only supplier panel).
- **Bundle / Package Products** — bundles composed of supplier and Crossbar
  products, quantity/required per item, bundle-aware workspace and catalog
  display, deletion cascade.
- **Operations Resource Library** — independent, reusable SOPs/templates/
  checklists/documents/videos with a Tiptap rich-text editor, department/
  owner/estimated-time metadata, product linking (many-to-many, no
  duplication), archive/restore, print view.
- **Product Image Management (v0.6)** — Supabase Storage-backed uploads for
  Crossbar and bundle products across five image types (hero, gallery,
  detail, lifestyle, mockup), single-hero enforcement, alt text/caption
  editing, archive/restore, permanent delete with Storage cleanup, hero-first
  thumbnails on the workspace and catalog.
- **Shopify Sales/Customer Data Pipeline** — live `orders/create` webhook
  (HMAC-verified, delivery-ID + natural-key idempotent) and a historical
  GraphQL Admin API importer (`--since`/`--until`/`--limit`/`--dry-run`,
  full nested line-item pagination, no truncated-order acceptance), both
  writing through one shared normalizer (see `docs/decisions.md`) into
  `online_stores`, `shopify_customers`, `shopify_orders`,
  `shopify_order_line_items`, and `shopify_webhook_events`. All five tables
  are RLS-locked with zero anon/authenticated policies; every read/write
  goes through server-only modules. 2026 orders from January through the
  live-webhook handoff have been backfilled (monthly imports, zero
  failures). Known, intentional limitation: legacy stores that pre-date
  Team Store Creator 2.0 remain unmapped (`online_store_id is null` on
  their line items) until they're migrated into the newer store system —
  this is expected, not a data-quality bug, and current mapping state is
  roughly 4,930 mapped line items, 1,092 intentionally-unmapped
  legacy/vendor/internal line items, 0 invalid/broken `online_store_id`
  references.
- **Online Store Workspace & Navigation** — `/stores` (searchable master
  list, loaded dynamically from `online_stores` — a new store row needs no
  new code or route to appear), `/stores/[storeId]` (redirects to
  Overview), a reusable per-store workspace shell (`[storeId]/layout.tsx`)
  with persistent Overview/Sales Data tabs, and a read-only Overview page.
  Internal-only; sidebar's "Team Stores → Stores" entry is now a live link.
- **Online Store Sales Dashboard** — per-store Total Sales, Fundraiser
  Earned, Paid Out, Balance Due, and Total Items summary cards; All Time/
  This Year/custom date-range filtering (payouts and the lifetime balance
  are deliberately *not* affected by the date filter — see
  `docs/decisions.md`); a detailed sales ledger (order #, date, product,
  quantity, item code, price, total); a best-selling-products ranking
  (grouped by Shopify product ID, not title or `catalog_product_id` —
  catalog matching doesn't exist yet); and an audit-style payout ledger
  with the ability to record a new payout. Sales figures are computed from
  line items only (never `shopify_orders.total_price`) and exclude
  cancelled orders; partial refunds are a known, documented V1 limitation
  (not proportionally deducted yet). No customer PII is exposed on this
  dashboard.

## Explicitly deferred (not started)

Gathered from scope notes across each build phase — these are known gaps,
not forgotten work:

- Nested bundles (a bundle containing another bundle)
- Bundle/product pricing and margin calculation
- Team-store package choices (letting a team pick options within a bundle)
- Image cropping, background removal, or compression UI
- Resumable / chunked uploads
- Drag-and-drop image and bundle-item sorting
- Variant/color-specific image assignment for Crossbar products
- Supabase Storage image transformations (on-the-fly resizing)
- AI image generation or AI-assisted product creation
- SOP step-by-step authoring mode
- Resource revision history and approval workflows
- Resource-to-machine relationships
- Permanent deletion of knowledge resources
- Row Level Security policies for the **product/catalog** tables
  (`catalog_products`, `product_images`, etc. currently rely on
  server-only service-role writes and anon-key reads; no per-user auth
  yet). Note this is a *different* gap from the Shopify sales/store
  module, which already has RLS enabled with zero anon/authenticated
  policies and is read exclusively through server-only data modules — see
  `docs/decisions.md`.
- Proportional refund allocation against store sales figures (partial
  refunds currently are not deducted from line-item totals — see
  `docs/decisions.md`)
- Item-level (as opposed to store-level) fundraiser percentages
- Migrating legacy (pre-Team-Store-Creator-2.0) stores into `online_stores`
  — their historical line items are intentionally left unmapped
  (`online_store_id is null`) until that migration happens, not treated as
  an error

## Longer-term vision (from the original project brief)

These are larger phases the catalog work is a foundation for, not yet
scoped into concrete tasks:

- **Shopify Product Publishing** — publish approved catalog products to
  Shopify, sync pricing/images/inventory. Distinct from the Shopify sales
  *ingestion* pipeline already shipped (Phase 2/3A pulls orders **from**
  Shopify; this would push catalog data **to** Shopify) — not started.
- **Quote System** — customer-facing product/color/size selection, roster
  upload, logo upload, mockup requests, quote approval
- **Customer Dashboard** — self-serve portal for stores, quotes, orders,
  artwork, rosters. Will need its own explicit authentication/
  authorization design and should default to read-only/reporting plus
  controlled request submission, not direct data editing — deliberately
  not started until the internal system (Phases 2–4B) has been used and
  security-reviewed.
- Additional supplier integrations (S&S Activewear, Alphabroder, Augusta
  Sportswear, Holloway, Charles River, Outdoor Cap)

### Next planned: Phase 4C — Online Store Catalog foundation

Add a **Catalog** section to the existing store workspace (alongside
Overview and Sales Data), connecting the existing Crossbar OS master
product/catalog system to `online_stores`. This is intended as the
foundation for **Online Store Creator 3.0** — built directly inside
Crossbar OS rather than as a separate application. Not started; documented
here so the next session can pick it up directly. Further store workspace
sections beyond Catalog (Logos/Artwork, Fundraising, Payments/Credits,
Requests, Settings, Shopify publishing, an eventual secure customer/
store-manager portal) are anticipated but not yet scoped.

## Sidebar sections still "Coming Soon"

Collections, Suppliers, Pricing, Teams/Coaches (under "Team Stores" —
"Stores" itself is now live at `/stores`), Artwork Library/Mockups/
Templates/Logos, Production (Jobs/Schedule/QC), Operations (Machines/
Maintenance/Inventory/Purchasing/Documents), Customers, Quotes, Projects,
Insights, and the AI workspace are all placeholders in the navigation
today — Catalog → Products/Collections, Operations → Resources & SOPs,
and Team Stores → Stores are live.

## Reporting source of truth

Google Sheets remains the operational tool for legacy Online Store
sales/fundraiser workflows for now — it has **not** been retired.
Supabase/Crossbar OS (the Phase 4B Sales Data dashboard) is the intended
long-term source of truth for Online Store sales reporting and is where
new reporting work should build going forward, but a formal cutover away
from the Sheet hasn't happened yet.
