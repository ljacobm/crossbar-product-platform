import type { SupabaseClient } from "@supabase/supabase-js";
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

// Returns every product ID that belongs in the Archived view: inactive
// products, plus active products whose workflow status has been manually
// set to Archived without archiving the product itself. The two source
// sets are disjoint by construction (one requires active=false, the other
// active=true), so no dedup is needed.
export async function getArchivedProductIds(supabase: SupabaseClient): Promise<number[]> {
  const [inactive, archivedWhileActive] = await Promise.all([
    supabase.from("catalog_products").select("id").eq("active", false),
    supabase
      .from("catalog_products")
      .select("id, catalog_settings!inner(workflow_status)")
      .eq("active", true)
      .eq("catalog_settings.workflow_status", "Archived"),
  ]);

  const inactiveIds = (inactive.data ?? []).map((row: { id: number }) => row.id);
  const archivedWhileActiveIds = (archivedWhileActive.data ?? []).map((row: { id: number }) => row.id);

  return [...inactiveIds, ...archivedWhileActiveIds];
}

// Fixed counts per view, ignoring any active search/brand/category/workflow
// refinements — these are the tab badge counts, not the filtered result count.
export async function getCatalogViewCounts(
  supabase: SupabaseClient
): Promise<Record<CatalogViewId, number>> {
  const [all, review, approved, websiteReady, teamStoreReady, inactive, archivedWhileActive] = await Promise.all([
    supabase.from("catalog_products").select("id", { count: "exact", head: true }).eq("active", true),
    supabase
      .from("catalog_products")
      .select("id, catalog_settings!inner(workflow_status)", { count: "exact", head: true })
      .eq("active", true)
      .in("catalog_settings.workflow_status", ["Imported", "Reviewing"]),
    supabase
      .from("catalog_products")
      .select("id, catalog_settings!inner(workflow_status)", { count: "exact", head: true })
      .eq("active", true)
      .in("catalog_settings.workflow_status", ["Approved", "Website Ready"]),
    supabase
      .from("catalog_products")
      .select("id, catalog_settings!inner(website_ready)", { count: "exact", head: true })
      .eq("active", true)
      .eq("catalog_settings.website_ready", true),
    supabase
      .from("catalog_products")
      .select("id, catalog_settings!inner(team_store_enabled)", { count: "exact", head: true })
      .eq("active", true)
      .eq("catalog_settings.team_store_enabled", true),
    supabase.from("catalog_products").select("id", { count: "exact", head: true }).eq("active", false),
    supabase
      .from("catalog_products")
      .select("id, catalog_settings!inner(workflow_status)", { count: "exact", head: true })
      .eq("active", true)
      .eq("catalog_settings.workflow_status", "Archived"),
  ]);

  return {
    all: all.count ?? 0,
    review: review.count ?? 0,
    approved: approved.count ?? 0,
    "website-ready": websiteReady.count ?? 0,
    "team-store-ready": teamStoreReady.count ?? 0,
    archived: (inactive.count ?? 0) + (archivedWhileActive.count ?? 0),
  };
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

// The single shared query builder behind both Catalog Manager (/products)
// and the Collection product selector (/collections/[id]/products/add).
// Both pages layer their own filter UI on top, but neither hand-builds the
// PostgREST query itself -- this is the one place that logic lives.
export async function queryProducts(
  supabase: SupabaseClient,
  filters: ProductQueryFilters
): Promise<ProductQueryResult> {
  const {
    query = "",
    brand = "",
    category = "",
    source = "",
    status = "active",
    workflow = "",
    view = "all",
    ageGroup = "",
    gender = "",
    youthOnly = false,
    excludeIds = [],
    page = 1,
    pageSize = 50,
  } = filters;

  let request = supabase
    .from("catalog_products")
    .select(PRODUCT_ROW_SELECT, { count: "exact" })
    .order("display_name", { ascending: true });

  if (query) {
    request = request.or(
      `display_name.ilike.%${query}%,crossbar_sku.ilike.%${query}%,brand_display.ilike.%${query}%,crossbar_category.ilike.%${query}%`
    );
  }

  if (brand) {
    request = request.eq("brand_display", brand);
  }

  if (category) {
    request = request.eq("crossbar_category", category);
  }

  if (source) {
    request = request.eq("source_type", source);
  }

  if (ageGroup) {
    request = request.eq("age_group", ageGroup);
  }

  if (gender) {
    request = request.eq("gender", gender);
  }

  if (youthOnly) {
    request = request.ilike("display_name", "%Youth%");
  }

  if (view === "all") {
    if (status === "active") {
      request = request.eq("active", true);
    } else if (status === "archived") {
      request = request.eq("active", false);
    }
  } else if (view === "archived") {
    const archivedIds = await getArchivedProductIds(supabase);
    request = request.in("id", archivedIds.length > 0 ? archivedIds : [-1]);
  } else {
    request = applyCatalogView(request, view);
  }

  if (workflow) {
    request = request.eq("catalog_settings.workflow_status", workflow);
  }

  if (excludeIds.length > 0) {
    request = request.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  request = request.range(from, to);

  const { data, error, count } = await request;

  return {
    products: (data as Product[]) ?? [],
    count: count ?? 0,
    error: Boolean(error),
  };
}
