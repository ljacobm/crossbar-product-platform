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
- Row Level Security policies (currently relies on server-only service-role
  writes and anon-key reads; no per-user auth yet)

## Longer-term vision (from the original project brief)

These are larger phases the catalog work is a foundation for, not yet
scoped into concrete tasks:

- **Shopify Integration** — publish approved products, sync pricing/images/
  inventory
- **Quote System** — customer-facing product/color/size selection, roster
  upload, logo upload, mockup requests, quote approval
- **Team Store Manager** — per-organization storefronts, roster management,
  order tracking, analytics
- **Customer Dashboard** — self-serve portal for stores, quotes, orders,
  artwork, rosters
- Additional supplier integrations (S&S Activewear, Alphabroder, Augusta
  Sportswear, Holloway, Charles River, Outdoor Cap)

## Sidebar sections still "Coming Soon"

Collections, Suppliers, Pricing, Team Stores/Teams/Coaches, Artwork Library/
Mockups/Templates/Logos, Production (Jobs/Schedule/QC), Operations
(Machines/Maintenance/Inventory/Purchasing/Documents), Customers,
Quotes, Projects, Insights, and the AI workspace are all placeholders in
the navigation today — only Catalog → Products and Operations → Resources &
SOPs are live.
