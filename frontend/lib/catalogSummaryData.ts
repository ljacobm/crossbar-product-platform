"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import { WORKFLOW_STATUSES, type WorkflowStatus } from "@/lib/workflowOptions";

// Server-only read path for the narrow, low-risk catalog_products-family
// reads in Phase B, slice 3a of the post-Stage-1 RLS follow-up (see
// docs/roadmap.md / docs/decisions.md). Mirrors lib/onlineStoreData.ts /
// lib/knowledgeResourceData.ts / lib/collectionData.ts: one small "use
// server" data module per feature, every exported function calling
// requireStaffSession() first, reads go through supabaseAdmin so they
// keep working the moment RLS is enabled on these tables (not yet
// enabled). The larger/shared catalog_products reads (Catalog Manager
// list, Collection product picker, Product Workspace/Edit) are deliberately
// out of scope here -- see later slices.

export type CatalogSummaryStats = {
  products: number;
  variants: number;
  images: number;
  suppliers: number;
};

// Backs components/SummaryCards.tsx.
export async function getCatalogSummaryStats(): Promise<CatalogSummaryStats> {
  await requireStaffSession();

  const [products, variants, images, suppliers] = await Promise.all([
    supabaseAdmin.from("catalog_products").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("product_variants").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("product_images").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("suppliers").select("*", { count: "exact", head: true }),
  ]);

  return {
    products: products.count ?? 0,
    variants: variants.count ?? 0,
    images: images.count ?? 0,
    suppliers: suppliers.count ?? 0,
  };
}

export type DashboardStatusCounts = {
  byStatus: Record<WorkflowStatus, number>;
  teamStoreReady: number;
};

// Backs app/(internal)/dashboard/page.tsx's stat cards.
export async function getDashboardStatusCounts(): Promise<DashboardStatusCounts> {
  await requireStaffSession();

  const [counts, teamStoreReady] = await Promise.all([
    Promise.all(
      WORKFLOW_STATUSES.map(async (status) => {
        const { count } = await supabaseAdmin
          .from("catalog_settings")
          .select("id", { count: "exact", head: true })
          .eq("workflow_status", status);
        return count ?? 0;
      })
    ),
    supabaseAdmin
      .from("catalog_products")
      .select("id, catalog_settings!inner(team_store_enabled)", { count: "exact", head: true })
      .eq("active", true)
      .eq("catalog_settings.team_store_enabled", true)
      .then((res) => res.count ?? 0),
  ]);

  const byStatus = {} as Record<WorkflowStatus, number>;
  WORKFLOW_STATUSES.forEach((status, index) => {
    byStatus[status] = counts[index];
  });

  return { byStatus, teamStoreReady };
}

export type CatalogSearchRow = {
  id: number;
  display_name: string;
  crossbar_sku: string | null;
  brand_display: string | null;
  crossbar_category: string | null;
  source_type: string;
  active: boolean;
  product_images: { id: number; image_url: string; sort_order: number | null }[];
};

// Backs GET /api/products/search.
export async function searchCatalogProducts(q: string): Promise<CatalogSearchRow[]> {
  await requireStaffSession();

  let query = supabaseAdmin
    .from("catalog_products")
    .select(
      `
      id,
      display_name,
      crossbar_sku,
      brand_display,
      crossbar_category,
      source_type,
      active,
      product_images (
        id,
        image_url,
        sort_order
      )
      `
    )
    .eq("active", true)
    .neq("source_type", "bundle")
    .order("display_name", { ascending: true })
    .order("sort_order", { foreignTable: "product_images", ascending: true })
    .limit(20);

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `display_name.ilike.%${escaped}%,crossbar_sku.ilike.%${escaped}%,brand_display.ilike.%${escaped}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to search catalog products: ${error.message}`);
  }

  return (data as unknown as CatalogSearchRow[]) ?? [];
}
