# Development Journal

## 2026-08-22

## Shopify Sales Data Pipeline + Online Store Workspace (Phases 1–4B)

### Added
- Five new Shopify sales/customer tables (`online_stores`,
  `shopify_customers`, `shopify_orders`, `shopify_order_line_items`,
  `shopify_webhook_events`), RLS-enabled with zero anon/authenticated
  policies from day one.
- Live `orders/create` webhook (HMAC verification, delivery-ID +
  natural-key idempotency, `shopify_webhook_events` audit trail with
  `received`/`processed`/`failed` status transitions).
- Historical order importer (`scripts/backfillShopifyOrders.ts`) against
  Shopify's GraphQL Admin API — date-range/limit/dry-run flags, full
  nested line-item pagination (never accepts a truncated order), sharing
  one canonical normalizer with the live webhook.
- 2026 orders (January through the live-webhook handoff) backfilled;
  monthly imports completed with zero failures.
- `online_stores` populated from Team Store Creator 2.0's Google Drive
  folder structure; line items linked via `online_store_id` (~4,930
  mapped, 1,092 intentionally-unmapped legacy/vendor/internal items, 0
  broken references).
- `/stores` navigation: searchable master list, per-store workspace shell
  (`[storeId]/layout.tsx`) with persistent Overview/Sales Data tabs,
  read-only Overview page. Sidebar's "Team Stores → Stores" is now live.
- Store Sales Data dashboard: Total Sales/Fundraiser Earned/Paid Out/
  Balance Due/Total Items summary cards, All Time/This Year/custom
  date-range filtering, detailed sales ledger, best-selling-products
  ranking, and an audit-style payout ledger with add-payout support.
- `online_stores.fundraiser_rate` (default `0.20`) and
  `online_store_payouts` (audit ledger, RLS enabled, zero policies).

### Decisions worth knowing (see `docs/decisions.md` for full reasoning)
- `online_stores` is the permanent canonical entity for Team Store
  Creator 2.0 today and Online Store Creator 3.0 later — never a separate
  `team_stores` table.
- Store sales are always computed from line items
  (`SUM(price * quantity)`, filtered by `online_store_id`), never from
  `shopify_orders.total_price` — an order can span multiple stores plus
  Crossbar add-ons.
- One shared canonical order shape (`NormalizedShopifyOrder`) is
  normalized into by both the webhook (REST) and the importer (GraphQL),
  so business rules can't diverge between the two ingestion paths.
- `source` on `shopify_orders` is set once at first insert and never
  overwritten by a later touch from either ingestion path.
- Fundraiser balance is always derived (earned − paid), never stored as a
  running total.

### Known limitations (documented, not bugs)
- Partial refunds are not proportionally deducted from store sales
  figures yet (only ~20 of ~2,900 orders affected).
- Legacy pre-Creator-2.0 stores remain unmapped until migrated into
  `online_stores` — expected, not an error.
- `shopify_orders.financial_status` casing is inconsistent between the
  webhook (`"paid"`) and historical-import (`"PAID"`) paths — not
  currently relied on for any filtering, but worth normalizing if that
  changes.

### Next planned (not started)
- Phase 4C — Online Store Catalog foundation (a Catalog tab connecting
  the master product catalog to `online_stores`; foundation for Online
  Store Creator 3.0 living inside Crossbar OS).

## 2026-07-11

## v0.6 - Product Image Management

### Added
- Crossbar product image uploads
- Hero image support
- Gallery images
- Detail images
- Lifestyle images
- Mockup images
- Product image management page
- Supabase Storage integration
- Image archive/restore
- Permanent delete with Storage cleanup

### Improved
- Product workspace
- Catalog thumbnails
- Bundle image support

### Fixed
- useActionState transition bug
- Upload preview clearing
- Hero image promotion

## 2026-06-28

Completed:

- Created frontend dashboard
- Added statistics cards
- Built searchable product table
- Created Product Detail page
- Added dynamic hero image
- Added color selector
- Added inventory table
- Added supplier pricing
- Added live image switching
- Added responsive layout

Next session:

- Image tools
- Product editing
- Pricing page
- Mockup generation