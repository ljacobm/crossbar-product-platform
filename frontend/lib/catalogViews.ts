import type { Product } from "@/components/ProductRow";

// Shared column set for anything rendering a ProductRow -- Catalog Manager
// and the Collection product selector both select exactly this shape so
// they can share ProductRow/ProductTableClient without drift.
export const PRODUCT_ROW_SELECT = `
  id,
  crossbar_sku,
  display_name,
  crossbar_category,
  brand_display,
  active,
  source_type,
  age_group,
  gender,
  product_images (
    id,
    image_url,
    color_name,
    image_type,
    active,
    sort_order
  ),
  catalog_settings!inner (
    workflow_status,
    website_ready,
    team_store_enabled
  )
`;

// Views a product may be added to a collection from. A collection only
// ever needs to browse products that are at least Approved -- Review
// Queue, Archived, and the raw "All Products" view are intentionally
// unreachable here.
export const COLLECTION_ELIGIBLE_VIEWS = [
  "approved",
  "website-ready",
  "team-store-ready",
] as const;

export type CollectionEligibleView = (typeof COLLECTION_ELIGIBLE_VIEWS)[number];

export function isCollectionEligibleView(value: string): value is CollectionEligibleView {
  return (COLLECTION_ELIGIBLE_VIEWS as readonly string[]).includes(value);
}

export const CATALOG_VIEWS = [
  { id: "all", label: "All Products" },
  { id: "review", label: "Review Queue" },
  { id: "approved", label: "Approved Catalog" },
  { id: "website-ready", label: "Website Ready" },
  { id: "team-store-ready", label: "Team Store Ready" },
  { id: "archived", label: "Archived" },
] as const;

export type CatalogViewId = (typeof CATALOG_VIEWS)[number]["id"];

export function isCatalogView(value: string): value is CatalogViewId {
  return (CATALOG_VIEWS as readonly { id: string }[]).some((v) => v.id === value);
}

export const CATALOG_VIEW_EMPTY_MESSAGES: Record<CatalogViewId, string> = {
  all: "No products found.",
  review: "No products currently need review.",
  approved: "No products have been approved for the Crossbar catalog yet.",
  "website-ready": "No products are marked website ready yet.",
  "team-store-ready": "No products are currently enabled for team stores.",
  archived: "No archived products.",
};

// Applies a catalog view's baseline scope to a products query. Views other
// than "all" own the active/archived scope outright, so callers should skip
// the plain status dropdown filter whenever a specific view is active.
//
// "archived" is intentionally NOT handled here: PostgREST's or() logic tree
// can't combine a base-table column (active) with an embedded-resource
// column (catalog_settings.workflow_status) in one expression. It's handled
// via getArchivedProductIds() instead, which fetches the two disjoint ID
// sets (active=false, and active=true AND workflow=Archived) and unions
// them client-side for an .in("id", ...) filter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCatalogView(request: any, view: Exclude<CatalogViewId, "archived" | "all">) {
  switch (view) {
    case "review":
      return request
        .eq("active", true)
        .in("catalog_settings.workflow_status", ["Imported", "Reviewing"]);
    case "approved":
      return request
        .eq("active", true)
        .in("catalog_settings.workflow_status", ["Approved", "Website Ready"]);
    case "website-ready":
      return request.eq("active", true).eq("catalog_settings.website_ready", true);
    case "team-store-ready":
      return request.eq("active", true).eq("catalog_settings.team_store_enabled", true);
    default:
      return request;
  }
}

export type ProductQueryFilters = {
  query?: string;
  brand?: string;
  category?: string;
  source?: string;
  status?: string; // active | archived | all -- only applied when view === "all"
  workflow?: string; // raw single-status refiner (Catalog Manager's "All Workflow" dropdown)
  view?: CatalogViewId;
  ageGroup?: string;
  gender?: string;
  youthOnly?: boolean;
  excludeIds?: number[];
  page?: number;
  pageSize?: number;
};

export type ProductQueryResult = {
  products: Product[];
  count: number;
  error: boolean;
};

// The query-building logic above (applyCatalogView) and the shared
// PRODUCT_ROW_SELECT column set are consumed by queryProducts(), which --
// along with getCatalogViewCounts() and getArchivedProductIds() -- now
// lives in lib/catalogProductData.ts, a dedicated "use server" module.
// This file (catalogViews.ts) stays a plain, directive-free module on
// purpose: it's imported by server components that need the view
// constants/types (CatalogViewTabs, CollectionSelectorPresets) alongside
// the ones that run the actual data query, and a "use server" file may
// only export async functions as real values -- it can't also export
// these plain constants and sync helpers. See lib/catalogProductData.ts
// for the full explanation.
