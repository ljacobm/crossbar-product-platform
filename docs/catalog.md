# Catalog Domain Model

## Central entity: `catalog_products`

Every sellable or bundleable thing — imported supplier product, in-house
Crossbar product, or a package of several products — is a row in
`catalog_products`, discriminated by `source_type`:

| `source_type` | Meaning | Editable in UI | Permanently deletable |
|---|---|---|---|
| `supplier` | Imported via the SanMar CSV pipeline | Crossbar-facing fields only (name, SKU, brand, category, description, active) | No — archive only |
| `crossbar` | In-house made product | Fully editable | Yes (if not referenced by a bundle) |
| `bundle` | A package composed of other products | Fully editable | Yes (if not referenced by another bundle) |

Common fields: `crossbar_sku`, `display_name`, `product_slug`,
`description_html`, `crossbar_category`, `brand_display`, `active`.

## Supplier products

Populated by `importers/import_sanmar.py` via `services/catalog_service.py`.
Each supplier product has a row in `supplier_products` (style, title, brand,
category from the supplier feed) and variants in `product_variants`
(color/size/price/inventory/supplier SKU). Supplier-sourced data —
including product images — is read-only everywhere in the catalog UI:
the product editor shows it in a read-only "Supplier Information" panel,
and the image manager shows a single "Imported Images" section with no
edit/archive/delete controls. Supplier products can be archived but never
permanently deleted from the UI.

## Crossbar products

Created via `/products/new/crossbar`. Extra in-house metadata lives in
`crossbar_product_data` (product family, production method, base template,
default size range, product/production notes) — created or updated
alongside the catalog row via `upsert` so editing works whether or not the
row already existed. Crossbar products have no supplier variants; instead
of a color/size table, their workspace shows uploaded images.

## Bundles

Created via `/products/new/bundle`. A bundle's contents live in
`product_bundle_items` (`bundle_catalog_product_id`, `child_catalog_product_id`,
`quantity`, `required`, `sort_order`). Bundles can currently contain
supplier and Crossbar products only — **nesting one bundle inside another
is not supported yet**. Deleting a bundle cascades its item rows; deleting
a product that's referenced as a child anywhere is blocked until it's
removed from the bundle first.

## Resources (SOPs, templates, checklists, documents)

`knowledge_resources` is an independent library (`/operations/resources`)
of reusable operational content — SOPs, cut templates, artwork templates,
QC checklists, documents, videos, and machine-setup instructions — each
with rich HTML content (Tiptap-authored, sanitized on write), a slug,
department, owner, estimated time, and status (Draft/Review/Approved/
Archived). `product_resource_links` is the many-to-many join to
`catalog_products`, carrying a per-product `relationship_type`, `required`
flag, notes, and `sort_order`. A resource can be linked to any number of
products without duplication; unlinking removes only the link row, never
the resource itself. Resources can be created either centrally or directly
from a product's resource page (`?productId=` auto-links on creation).
Archiving a resource hides it from the library and from "link an existing
resource" search, but existing links to it remain visible.

## Images

`product_images` holds both legacy supplier-imported rows
(`image_type = 'product'`, `supplier_product_id` set, no `storage_path`)
and newer Crossbar/bundle uploads (`image_type` one of `hero`, `gallery`,
`detail`, `lifestyle`, `mockup`; `supplier_product_id` null;
`storage_path` set to the Supabase Storage object key). Only rows with a
non-null `storage_path` can be permanently deleted (their Storage object is
removed first); everything else supports archive/restore only.

Hero selection is resolved the same way everywhere (product workspace,
catalog thumbnail, bundle workspace): the active row with
`image_type = 'hero'` wins; otherwise the first active image ordered by
`sort_order` then `id`; otherwise a placeholder icon. Exactly one hero is
enforced per product — setting a new hero automatically demotes the
previous one to `gallery`, and the first image uploaded to a product with
no existing hero is auto-promoted.

## Product lifecycle

Create → Edit → Archive/Restore → Permanent Delete (Crossbar/bundle only).
Permanent deletion first removes any uploaded Storage objects for that
product's images, then the `catalog_products` row (cascading bundle items,
resource links, and image rows via FK). It's blocked if the product is
referenced as a bundle child, or if it's a supplier product.

## Catalog list (`/products`)

Search across name/SKU/brand/category, filter by brand/category/status
(Active/Archived/All). Thumbnails use the same hero-first resolution as
the workspace, falling back to a package icon for bundles or a generic
image icon otherwise.
