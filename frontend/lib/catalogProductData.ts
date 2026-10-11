"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import type { Product } from "@/components/ProductRow";
import type { ProductImageRow } from "@/components/ProductImageCard";
import {
  PRODUCT_ROW_SELECT,
  applyCatalogView,
  type CatalogViewId,
  type ProductQueryFilters,
  type ProductQueryResult,
} from "@/lib/catalogViews";

// Server-only read path for the shared catalog_products query builder --
// Phase B, slice 3b of the post-Stage-1 RLS follow-up (see
// docs/roadmap.md / docs/decisions.md). Mirrors lib/onlineStoreData.ts /
// lib/knowledgeResourceData.ts / lib/collectionData.ts /
// lib/catalogSummaryData.ts: a "use server" data module, every exported
// function calling requireStaffSession() first, reads go through
// supabaseAdmin so they keep working the moment RLS is enabled on
// catalog_products (not yet enabled).
//
// lib/catalogViews.ts itself CANNOT take on this role directly: a "use
// server" file may only export async functions as real (non-type)
// values, and catalogViews.ts also exports plain constants (CATALOG_VIEWS,
// PRODUCT_ROW_SELECT, ...) and synchronous helpers (isCatalogView,
// applyCatalogView, ...) that server-rendered, non-"use server" components
// like CatalogViewTabs and CollectionSelectorPresets need to import
// directly -- exactly the same "use server" export-shape constraint that
// caused the app/login/actions.ts runtime error fixed earlier. So the data
// functions move here, into their own "use server" module, while
// catalogViews.ts keeps the shared constants/types/view-matching helpers
// that aren't sensitive reads and have no reason to require a staff
// session to merely import.

// Returns every product ID that belongs in the Archived view: inactive
// products, plus active products whose workflow status has been manually
// set to Archived without archiving the product itself. The two source
// sets are disjoint by construction (one requires active=false, the other
// active=true), so no dedup is needed.
//
// Private helper -- only ever called from queryProducts() below (the
// "archived" view branch), never imported directly anywhere else, so it
// doesn't need its own requireStaffSession() call; the caller that reaches
// it already checked.
async function getArchivedProductIds(): Promise<number[]> {
  const [inactive, archivedWhileActive] = await Promise.all([
    supabaseAdmin.from("catalog_products").select("id").eq("active", false),
    supabaseAdmin
      .from("catalog_products")
      .select("id, catalog_settings!inner(workflow_status)")
      .eq("active", true)
      .eq("catalog_settings.workflow_status", "Archived"),
  ]);

  const inactiveIds = (inactive.data ?? []).map((row: { id: number }) => row.id);
  const archivedWhileActiveIds = (archivedWhileActive.data ?? []).map(
    (row: { id: number }) => row.id
  );

  return [...inactiveIds, ...archivedWhileActiveIds];
}

// Fixed counts per view, ignoring any active search/brand/category/workflow
// refinements -- the tab badge counts, not the filtered result count.
export async function getCatalogViewCounts(): Promise<Record<CatalogViewId, number>> {
  await requireStaffSession();

  const [all, review, approved, websiteReady, teamStoreReady, inactive, archivedWhileActive] =
    await Promise.all([
      supabaseAdmin.from("catalog_products").select("id", { count: "exact", head: true }).eq("active", true),
      supabaseAdmin
        .from("catalog_products")
        .select("id, catalog_settings!inner(workflow_status)", { count: "exact", head: true })
        .eq("active", true)
        .in("catalog_settings.workflow_status", ["Imported", "Reviewing"]),
      supabaseAdmin
        .from("catalog_products")
        .select("id, catalog_settings!inner(workflow_status)", { count: "exact", head: true })
        .eq("active", true)
        .in("catalog_settings.workflow_status", ["Approved", "Website Ready"]),
      supabaseAdmin
        .from("catalog_products")
        .select("id, catalog_settings!inner(website_ready)", { count: "exact", head: true })
        .eq("active", true)
        .eq("catalog_settings.website_ready", true),
      supabaseAdmin
        .from("catalog_products")
        .select("id, catalog_settings!inner(team_store_enabled)", { count: "exact", head: true })
        .eq("active", true)
        .eq("catalog_settings.team_store_enabled", true),
      supabaseAdmin.from("catalog_products").select("id", { count: "exact", head: true }).eq("active", false),
      supabaseAdmin
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

// The single shared query builder behind both Catalog Manager (/products)
// and the Collection product selector (/collections/[id]/products/add).
// Both pages layer their own filter UI on top, but neither hand-builds the
// PostgREST query itself -- this is the one place that logic lives.
export async function queryProducts(filters: ProductQueryFilters): Promise<ProductQueryResult> {
  await requireStaffSession();

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

  let request = supabaseAdmin
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
    const archivedIds = await getArchivedProductIds();
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

// Phase B, slice 3c additions -- the remaining narrow catalog_products /
// product_images reads identified in the audit.

export type CatalogProductSummary = { id: number; display_name: string };

// Shared by the "New Resource" product-link header and the Product
// Resources page header -- both only ever needed {id, display_name}.
export async function getCatalogProductSummary(
  id: string | number
): Promise<CatalogProductSummary | null> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("catalog_products")
    .select("id, display_name")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

// Backs the Catalog Manager page's brand/category filter dropdowns.
export async function getCatalogBrandCategoryFacets(): Promise<{
  brands: string[];
  categories: string[];
}> {
  await requireStaffSession();

  const [{ data: brandRows }, { data: categoryRows }] = await Promise.all([
    supabaseAdmin.from("catalog_products").select("brand_display").not("brand_display", "is", null),
    supabaseAdmin
      .from("catalog_products")
      .select("crossbar_category")
      .not("crossbar_category", "is", null),
  ]);

  const brands = Array.from(
    new Set((brandRows || []).map((row) => row.brand_display).filter(Boolean))
  ).sort();

  const categories = Array.from(
    new Set((categoryRows || []).map((row) => row.crossbar_category).filter(Boolean))
  ).sort();

  return { brands, categories };
}

// Backs the Add Products to Collection page's brand/category/age-group
// filter dropdowns. Deliberately a separate function from
// getCatalogBrandCategoryFacets() rather than a shared one extended with
// an optional age-group fetch -- keeps each page's exact original query
// count/shape untouched instead of coupling the two call sites together.
export async function getCollectionProductFacets(): Promise<{
  brands: string[];
  categories: string[];
  ageGroups: string[];
}> {
  await requireStaffSession();

  const [{ data: brandRows }, { data: categoryRows }, { data: ageGroupRows }] = await Promise.all([
    supabaseAdmin.from("catalog_products").select("brand_display").not("brand_display", "is", null),
    supabaseAdmin
      .from("catalog_products")
      .select("crossbar_category")
      .not("crossbar_category", "is", null),
    supabaseAdmin.from("catalog_products").select("age_group").not("age_group", "is", null),
  ]);

  const brands = Array.from(
    new Set((brandRows || []).map((row) => row.brand_display).filter(Boolean))
  ).sort();

  const categories = Array.from(
    new Set((categoryRows || []).map((row) => row.crossbar_category).filter(Boolean))
  ).sort();

  const ageGroups = Array.from(
    new Set((ageGroupRows || []).map((row) => row.age_group).filter(Boolean))
  ).sort();

  return { brands, categories, ageGroups };
}

export type CatalogProductForImages = { id: number; display_name: string; source_type: string };

// Backs the Product Images page header + manage/read-only determination.
export async function getCatalogProductForImages(
  id: string | number
): Promise<CatalogProductForImages | null> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("catalog_products")
    .select("id, display_name, source_type")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

// Backs the Product Images page's image grid.
export async function getProductImagesList(
  catalogProductId: string | number
): Promise<ProductImageRow[]> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("product_images")
    .select("id, image_url, image_type, alt_text, caption, sort_order, active, storage_path")
    .eq("catalog_product_id", catalogProductId)
    .order("image_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  return data ?? [];
}

// Phase B, slice 3d additions -- Product Workspace and Product Edit, the
// last remaining anon-client catalog reads.

// Backs the Product Workspace's main product + variants query. Kept as a
// wildcard select (matching the original query exactly) rather than
// narrowed to named columns -- ProductHeroWorkspace's own `Product` type
// (components/ProductHeroWorkspace.tsx) is what actually constrains which
// fields get used, same as before this migration.
export async function getProductWorkspaceCore(id: string | number) {
  await requireStaffSession();

  const { data: product, error } = await supabaseAdmin
    .from("catalog_products")
    .select(
      `
      *,
      product_variants (
        id,
        color_name,
        size_name,
        supplier_sku,
        supplier_price,
        inventory_qty
      )
      `
    )
    .eq("id", id)
    .single();

  return { product, error };
}

export type ProductWorkspaceImageRow = {
  id: number;
  image_url: string;
  image_type: string;
  alt_text: string | null;
  caption: string | null;
  color_name: string | null;
  sort_order: number | null;
};

// Backs the Product Workspace's hero/gallery image list. Returns raw rows
// -- the hero-first sort stays in the page, same as before.
export async function getProductWorkspaceImages(
  catalogProductId: string | number
): Promise<ProductWorkspaceImageRow[]> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("product_images")
    .select("id, image_url, image_type, alt_text, caption, color_name, sort_order")
    .eq("catalog_product_id", catalogProductId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  return data ?? [];
}

export type ProductCatalogSettingsRow = {
  workflow_status: string | null;
  website_ready: boolean | null;
  team_store_enabled: boolean | null;
  approved_by: string | null;
  approved_at: string | null;
  website_ready_at: string | null;
  price_rule_code: string | null;
};

// Backs the Product Workspace's status card, readiness checklist, and
// price-rule check.
export async function getProductCatalogSettings(
  catalogProductId: string | number
): Promise<ProductCatalogSettingsRow | null> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("catalog_settings")
    .select(
      "workflow_status, website_ready, team_store_enabled, approved_by, approved_at, website_ready_at, price_rule_code"
    )
    .eq("catalog_product_id", catalogProductId)
    .maybeSingle();

  return data;
}

export type BundleItemLinkRaw = {
  id: number;
  quantity: number;
  required: boolean;
  sort_order: number | null;
  child: {
    id: number;
    display_name: string;
    crossbar_sku: string;
    brand_display: string | null;
    crossbar_category: string | null;
    source_type: string;
    active: boolean;
    product_images: { id: number; image_url: string; sort_order: number | null }[];
  } | null;
};

// Shared by the Product Workspace (raw nested display) and the Product
// Edit page (flattened into BundleSelectedItem for the bundle editor) --
// both queries were already byte-for-byte identical before this change.
export async function getBundleItemLinks(
  bundleCatalogProductId: string | number
): Promise<BundleItemLinkRaw[]> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("product_bundle_items")
    .select(
      `
      id,
      quantity,
      required,
      sort_order,
      child:catalog_products!child_catalog_product_id (
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
      )
      `
    )
    .eq("bundle_catalog_product_id", bundleCatalogProductId)
    .order("sort_order", { ascending: true });

  return (data as unknown as BundleItemLinkRaw[]) ?? [];
}

export type CatalogProductEditRow = {
  id: number;
  display_name: string;
  crossbar_sku: string;
  product_slug: string | null;
  description_html: string | null;
  crossbar_category: string | null;
  brand_display: string | null;
  source_type: string;
  active: boolean;
};

// Backs the Product Edit page's main form fields.
export async function getCatalogProductForEdit(
  id: string | number
): Promise<CatalogProductEditRow | null> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("catalog_products")
    .select(
      `
      id,
      display_name,
      crossbar_sku,
      product_slug,
      description_html,
      crossbar_category,
      brand_display,
      source_type,
      active
      `
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

export type CrossbarProductDataRow = {
  product_family: string | null;
  production_method: string | null;
  base_template: string | null;
  default_size_range: string | null;
  product_notes: string | null;
  production_notes: string | null;
};

// Backs the Product Edit page's Crossbar-specific fields (source_type ===
// "crossbar" only).
export async function getCrossbarProductData(
  catalogProductId: string | number
): Promise<CrossbarProductDataRow | null> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("crossbar_product_data")
    .select(
      `
      product_family,
      production_method,
      base_template,
      default_size_range,
      product_notes,
      production_notes
      `
    )
    .eq("catalog_product_id", catalogProductId)
    .maybeSingle();

  return data;
}

export type SupplierProductSummaryRow = {
  supplier_style: string | null;
  supplier_title: string | null;
  supplier_brand: string | null;
  supplier_category: string | null;
};

// Backs the Product Edit page's read-only supplier info panel
// (source_type === "supplier" only).
export async function getSupplierProductSummary(
  catalogProductId: string | number
): Promise<SupplierProductSummaryRow | null> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("supplier_products")
    .select("supplier_style, supplier_title, supplier_brand, supplier_category")
    .eq("catalog_product_id", catalogProductId)
    .order("id", { ascending: true })
    .limit(1);

  return data?.[0] ?? null;
}
