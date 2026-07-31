import type { SupabaseClient } from "@supabase/supabase-js";

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
