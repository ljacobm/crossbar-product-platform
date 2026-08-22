# Architecture

Crossbar OS is an internal operating system for Crossbar Athletics. The
`frontend/` app is a Next.js (App Router) application backed by Supabase
(Postgres + Storage). Python scripts in `importers/`, `services/`, and
`normalization.py` handle bulk supplier catalog ingestion and are separate
from the web app's runtime path.

## Tech stack

- **Next.js 16** (App Router, Turbopack, Server Components + Server Actions)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase**: Postgres (data), Storage (uploaded product images)
- **Tiptap**: rich-text editing for the Operations Resource Library

## Directory structure

```
frontend/
  app/
    products/
      new/                    product creation (crossbar, bundle)
      [id]/                   product workspace (page.tsx, actions.ts)
      [id]/edit/               source-aware product editor
      [id]/resources/          product <-> knowledge_resources linking
      [id]/images/             product image upload & management
    operations/
      resources/               centralized Knowledge & SOP Library
    stores/                     Online Store navigation (Phase 4A/4B)
      page.tsx                  master list, loaded from online_stores
      [storeId]/layout.tsx       reusable workspace shell (fetch, header, tabs)
      [storeId]/page.tsx         redirects to .../overview
      [storeId]/overview/        read-only store metadata
      [storeId]/sales/            Sales Data dashboard
    api/
      products/search/         product picker search (bundles, resources)
      resources/search/        resource picker search
      webhooks/shopify/         live orders/create webhook (route.ts, ingest.ts)
  components/                 shared UI, mostly client components
  lib/
    supabase.ts                anon-key client (safe for Server Components)
    supabase-admin.ts          service-role client (server-only, writes)
    resourceOptions.ts         resource type/status constants
    imageOptions.ts            image type/MIME/size constants, bucket name
    sanitizeHtml.ts             HTML allowlist sanitizer for rich content
    onlineStoreData.ts          "use server" reads for online_stores
    onlineStoreSalesData.ts     "use server" reads for store sales/payouts
    onlineStorePayoutActions.ts "use server" mutation: record a payout
    shopifyHmac.ts               webhook signature verification
    shopifyParsing.ts            vendor/variant/property parsing (pure fns)
    shopifyNormalized.ts         canonical order shape + shared DB writer
    shopifyRestAdapter.ts         REST (webhook) -> canonical shape
    shopifyGraphQLAdapter.ts      GraphQL (historical importer) -> canonical shape
    shopifyAdminClient.ts         Shopify Admin API token + GraphQL client
  scripts/
    backfillShopifyOrders.ts    standalone historical order importer (tsx)

database/
  schema_v2.sql                canonical full-schema mirror
  migrations/                  dated, additive SQL files (see below)
```

## Data access pattern

Two Supabase clients exist, and the split is deliberate:

- `lib/supabase.ts` — anon key, used directly in **Server Components** for
  reads, for tables with no RLS or an anon-readable policy (product/
  catalog tables today). Safe because it's still server-side rendering,
  and RLS/anon permissions gate what it can see.
- `lib/supabase-admin.ts` — service-role key, marked `import "server-only"`,
  used **exclusively inside `"use server"` modules**. It is never imported
  into a Client Component and the key is never sent to the browser. Two
  shapes of `"use server"` module exist:
  - **Mutations** — a route-colocated `actions.ts`, called from a form via
    `useActionState` (the original, catalog-side convention).
  - **Reads for RLS-locked tables** — a small dedicated data module (e.g.
    `lib/onlineStoreData.ts`, `lib/onlineStoreSalesData.ts`), exporting
    plain async functions that Server Components `await` directly during
    render. This is the pattern for the Shopify sales/store module, where
    the underlying tables have RLS enabled with zero anon/authenticated
    policies (see `docs/decisions.md`) and the anon client genuinely
    cannot read them at all.

## Shopify sales data pipeline

Two ingestion paths, one shared normalizer, so business rules (vendor
parsing, add-on detection, store matching, natural-key idempotency,
`source` provenance) can never drift between them:

- **Live webhook** — `app/api/webhooks/shopify/route.ts` verifies
  `X-Shopify-Hmac-Sha256` (raw body, timing-safe compare) before anything
  else, then upserts a `shopify_webhook_events` audit row keyed on
  `X-Shopify-Webhook-Id` (query-first, never a blind overwrite — a
  `received` row younger than 5 minutes is treated as in-flight and
  short-circuits to a duplicate response; older/`failed` rows retry).
  `ingest.ts` hands the parsed REST payload to `shopifyRestAdapter.ts`.
- **Historical importer** — `scripts/backfillShopifyOrders.ts`, run
  standalone via `npx tsx` (outside Next's bundler — it builds its own
  Supabase admin client rather than importing `lib/supabase-admin.ts`,
  since that file's `"server-only"` guard relies on a bundler condition
  `tsx` doesn't set and would throw). Fetches orders via the Shopify
  GraphQL Admin API (client-credentials grant, `lib/shopifyAdminClient.ts`),
  paginates line items fully rather than ever accepting a truncated order,
  and hands each order to `shopifyGraphQLAdapter.ts`.
- **Shared core** — both adapters translate their source shape (REST JSON
  vs. GraphQL global IDs/`MoneyBag`/`customAttributes`) into one canonical
  `NormalizedShopifyOrder` (`lib/shopifyNormalized.ts`), whose
  `upsertNormalizedOrder()` is the only function that writes to
  `shopify_customers`/`shopify_orders`/`shopify_order_line_items`. Every
  upsert is keyed on Shopify's own natural ID
  (`shopify_customer_id`/`shopify_order_id`/`shopify_line_item_id`), so
  re-running an overlapping historical import range, or Shopify retrying a
  webhook delivery, converges to the same rows rather than duplicating
  anything. See `docs/decisions.md` for the `source`-preservation rule and
  the line-item-vs-order-total sales calculation rule.

## Server Actions convention

Every route segment that mutates data has a co-located `actions.ts` file
with `"use server"` at the top. Parameterized actions follow a `.bind`
pattern so they can be wired into `useActionState` per-row:

```ts
const archiveWithId = archiveProduct.bind(null, productId);
const [state, action, pending] = useActionState(archiveWithId, initialState);
```

Actions that build `FormData` programmatically (e.g. multi-file upload with
per-file metadata) must dispatch the `useActionState` action inside
`startTransition`, since calling it directly outside a transition throws.
Where a native `<form action={action}>` is sufficient, that's preferred as
the simpler option.

Every mutation ends with `revalidatePath(...)` for the catalog list, the
product workspace, and any other page whose data just changed (e.g. an
image edit revalidates `/products`, `/products/[id]`, and
`/products/[id]/images`).

## Storage

Uploaded product images live in a public Supabase Storage bucket named
`product-images`. Buckets are not created or altered by application code —
they're provisioned once via the Supabase dashboard or Storage API, outside
the app's control, because bucket creation is an infrastructure decision.

Objects are stored at:

```
products/{catalog_product_id}/{uuid}.{extension}
```

Each uploaded image's `storage_path` is recorded in `product_images` so it
can be looked up directly for deletion (archive vs. permanent delete vs.
product deletion cascade) without ever listing the bucket.

## Migrations

There is no migration runner or ORM. Each schema change is a small,
non-destructive, dated SQL file under `database/migrations/` (e.g.
`alter table ... add column if not exists ...`), and `database/schema_v2.sql`
is kept as the canonical "what the schema looks like today" reference,
updated in lockstep with every migration. Migrations are applied manually
against Supabase (SQL editor or equivalent) since the agent building this
app has no direct Postgres/DDL access — only the REST API via the
service-role key, which cannot run arbitrary DDL.

## Rendering & data flow

Product, resource, and image data is fetched directly in Server Components
per page (no client-side data-fetching library). Interactive pieces
(search-as-you-type pickers, upload forms, inline editors) are Client
Components that call Server Actions and rely on Next's revalidation to
refresh the server-rendered parts of the tree afterward.
