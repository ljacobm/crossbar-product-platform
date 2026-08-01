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
    api/
      products/search/         product picker search (bundles, resources)
      resources/search/        resource picker search
  components/                 shared UI, mostly client components
  lib/
    supabase.ts                anon-key client (safe for Server Components)
    supabase-admin.ts          service-role client (server-only, writes)
    resourceOptions.ts         resource type/status constants
    imageOptions.ts            image type/MIME/size constants, bucket name
    sanitizeHtml.ts             HTML allowlist sanitizer for rich content

database/
  schema_v2.sql                canonical full-schema mirror
  migrations/                  dated, additive SQL files (see below)
```

## Data access pattern

Two Supabase clients exist, and the split is deliberate:

- `lib/supabase.ts` — anon key, used directly in **Server Components** for
  reads. Safe because it's still server-side rendering, and RLS/anon
  permissions gate what it can see.
- `lib/supabase-admin.ts` — service-role key, marked `import "server-only"`,
  used **exclusively inside Server Actions** (`actions.ts` files) for writes,
  validation lookups, and Storage operations. It is never imported into a
  Client Component and the key is never sent to the browser.

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
