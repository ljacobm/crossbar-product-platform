"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import { resolveCatalogAccessStoreId, recordCatalogAccess } from "@/lib/onlineStoreCatalogAccess";
import { computeCatalogDiff, catalogDiffIsEmpty, type CatalogItemKey } from "@/lib/onlineStoreCatalogDiffLogic";
import { catalogCategoryGroupLabel } from "@/lib/catalogCategoryGroups";
import { pickLatestSubmissionStatus, type RawSubmissionStatusRow } from "@/lib/onlineStoreCatalogSubmissionStatusLogic";
import { isUniqueViolationError } from "@/lib/postgresErrors";
import type {
  CatalogDraftSummaryItem,
  CatalogFacetOption,
  CatalogFacets,
  CatalogSortOption,
  CatalogStyleOption,
  CatalogSubmissionStatusItem,
} from "@/lib/onlineStoreCatalogTypes";

// Customer-facing ("use server") data access for the Online Store
// Builder catalog workspace. Every CUSTOMER-facing function here takes
// a raw bearer token as its first argument and resolves the store id
// from it via resolveCatalogAccessStoreId() -- never a store id passed
// directly from the client. This is the concrete implementation of
// "never rely solely on an unverified store identifier in the URL."
// Every failure mode (invalid token, revoked, expired, store not
// found/inactive) returns null/false/empty rather than throwing, so
// the calling page can render one generic "this link isn't available"
// message, matching the non-disclosure convention already used for
// the fundraiser portal.
//
// getStoreCatalogPreview() (near the bottom) is the ONE staff-facing
// exception -- it calls requireStaffSession() instead of resolving a
// token, for the Team Store Ready "Preview Customer Catalog" link
// (Catalog tab, app/(internal)/stores/[storeId]/catalog/page.tsx). It
// shares buildCatalogWorkspace() with the real customer path below so
// staff see EXACTLY what a customer would see, never a second,
// drifting implementation.
//
// No pricing/cost data (supplier_price, inventory_qty, internal
// notes) is selected anywhere in this file -- only display_name,
// brand_display, crossbar_category, gender, age_group,
// description_html, color_name, size_name, and image_url.

const DEFAULT_PAGE_SIZE = 24;

export interface CatalogWorkspaceFilters {
  query?: string;
  // Multi-select: OR within this array (any match passes), AND across
  // the different filter fields (every non-empty field must pass).
  // categories compares against catalogCategoryGroupLabel(style's raw
  // crossbar_category), never the raw value directly -- see
  // lib/catalogCategoryGroups.ts for why.
  categories?: string[];
  brands?: string[];
  genders?: string[];
  ageGroups?: string[];
  sort?: CatalogSortOption;
  page?: number;
  pageSize?: number;
}

export interface CatalogWorkspace {
  storeId: number;
  storeName: string;
  facets: CatalogFacets;
  styles: CatalogStyleOption[];
  // Count after search/filter, before the page slice -- what
  // pagination controls need.
  totalMatching: number;
  page: number;
  pageSize: number;
  // Unfiltered count of every active approved style -- "454 approved
  // products" style messaging, independent of the current filters.
  totalApprovedCount: number;
  // Total current draft item count for this store, across every style
  // (not just the current page/filtered set) -- the header's "N
  // selected" badge.
  selectedCount: number;
}

type ApprovedStyleRow = {
  id: number;
  style_code: string;
  supplier_product_id: number;
  supplier_products: {
    catalog_product_id: number;
    catalog_products: {
      display_name: string;
      brand_display: string | null;
      crossbar_category: string | null;
      gender: string | null;
      age_group: string | null;
      description_html: string | null;
    } | { display_name: string; brand_display: string | null; crossbar_category: string | null; gender: string | null; age_group: string | null; description_html: string | null }[];
  } | null;
};

function firstRelated<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

async function resolveStoreOrNull(rawToken: string): Promise<{ storeId: number; tokenId: number } | null> {
  return resolveCatalogAccessStoreId(rawToken);
}

// Shared core -- everything after "we know the storeId and the store
// is active" lives here, used by BOTH the real customer path
// (getCustomerCatalogWorkspace, below) and the staff preview path
// (getStoreCatalogPreview, at the bottom of this file). Never
// token-aware itself.
async function buildCatalogWorkspace(
  storeId: number,
  storeName: string,
  filters: CatalogWorkspaceFilters
): Promise<CatalogWorkspace> {
  const {
    query,
    categories = [],
    brands = [],
    genders = [],
    ageGroups = [],
    sort = "name-asc",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = filters;

  // Step 1: every active approved style's lightweight metadata (no
  // variants/images yet -- those are fetched only for the current
  // page's slice, below). 454 rows with a two-level join is cheap for
  // Postgres; this is the one query that scans the full approved list.
  const { data: approvedRows, error: approvedError } = await supabaseAdmin
    .from("approved_catalog_styles")
    .select(
      `
      id, style_code, supplier_product_id,
      supplier_products (
        catalog_product_id,
        catalog_products ( display_name, brand_display, crossbar_category, gender, age_group, description_html )
      )
    `
    )
    .eq("active", true);

  if (approvedError) {
    throw new Error(`Failed to load approved catalog styles: ${approvedError.message}`);
  }

  const approved = (approvedRows ?? []) as unknown as ApprovedStyleRow[];
  const totalApprovedCount = approved.length;

  type StyleMeta = {
    approvedCatalogStyleId: number;
    supplierProductId: number;
    styleCode: string;
    catalogProductId: number;
    displayName: string;
    brandDisplay: string | null;
    crossbarCategory: string | null;
    gender: string | null;
    ageGroup: string | null;
    descriptionHtml: string | null;
  };

  const metaList: StyleMeta[] = approved.map((row) => {
    const sp = firstRelated(row.supplier_products);
    const cp = firstRelated(sp?.catalog_products);
    return {
      approvedCatalogStyleId: row.id,
      supplierProductId: row.supplier_product_id,
      styleCode: row.style_code,
      catalogProductId: sp?.catalog_product_id ?? 0,
      displayName: cp?.display_name ?? `Style #${row.id}`,
      brandDisplay: cp?.brand_display ?? null,
      crossbarCategory: cp?.crossbar_category ?? null,
      gender: cp?.gender ?? null,
      ageGroup: cp?.age_group ?? null,
      descriptionHtml: cp?.description_html ?? null,
    };
  });

  // Facets reflect the FULL approved set, never the already-filtered
  // one -- otherwise checkboxes would disappear as soon as one was
  // checked. Counts are likewise against the full set, not the
  // currently-filtered one, for the same reason (and so counts don't
  // have to be recomputed per filter combination).
  function buildFacetOptions(values: (string | null)[]): CatalogFacetOption[] {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }

  const facets: CatalogFacets = {
    categories: buildFacetOptions(metaList.map((s) => (s.crossbarCategory ? catalogCategoryGroupLabel(s.crossbarCategory) : null))),
    brands: buildFacetOptions(metaList.map((s) => s.brandDisplay)),
    genders: buildFacetOptions(metaList.map((s) => s.gender)),
    ageGroups: buildFacetOptions(metaList.map((s) => s.ageGroup)),
  };

  // Step 2: search (name, brand, OR style code -- all in JS, not a
  // PostgREST .or() across a base column and a doubly-nested embedded
  // column, which this project's own existing code has already found
  // unsupported -- see lib/catalogViews.ts's own comment on
  // applyCatalogView for the same limitation elsewhere) + filter + sort.
  // Multi-select: OR within one filter group (any selected value
  // matches), AND across groups (every non-empty group must match).
  const q = query?.trim().toLowerCase();
  let filtered = metaList.filter((style) => {
    if (categories.length > 0 && !categories.includes(style.crossbarCategory ? catalogCategoryGroupLabel(style.crossbarCategory) : "")) {
      return false;
    }
    if (brands.length > 0 && !brands.includes(style.brandDisplay ?? "")) return false;
    if (genders.length > 0 && !genders.includes(style.gender ?? "")) return false;
    if (ageGroups.length > 0 && !ageGroups.includes(style.ageGroup ?? "")) return false;
    if (q) {
      const haystack = `${style.displayName} ${style.brandDisplay ?? ""} ${style.styleCode}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    switch (sort) {
      case "brand-asc":
        return (a.brandDisplay ?? "").localeCompare(b.brandDisplay ?? "") || a.displayName.localeCompare(b.displayName);
      case "category-asc":
        return (a.crossbarCategory ?? "").localeCompare(b.crossbarCategory ?? "") || a.displayName.localeCompare(b.displayName);
      case "newest":
        // Higher approvedCatalogStyleId == added more recently (ids
        // are a bigserial, monotonically increasing on insert) --
        // avoids a second query just for created_at ordering.
        return b.approvedCatalogStyleId - a.approvedCatalogStyleId;
      case "name-asc":
      default:
        return a.displayName.localeCompare(b.displayName);
    }
  });

  const totalMatching = filtered.length;
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  const pageMeta = filtered.slice(start, start + pageSize);

  // Step 3: variants (colors + sizes) and images, scoped ONLY to the
  // current page's supplier_product_ids -- this is the "support
  // hundreds of approved products efficiently" part: a browse request
  // never fetches variant/image rows for styles that aren't even being
  // rendered.
  const pageSupplierProductIds = pageMeta.map((s) => s.supplierProductId);
  const colorsByStyleId = new Map<number, Set<string>>();
  const sizesByStyleId = new Map<number, Set<string>>();
  const heroImageByStyleId = new Map<number, string>();
  // color_name -> image_url, per supplier product -- product_images
  // already carries a color_name column in the SAME text domain as
  // product_variants.color_name (confirmed by direct per-product query
  // against MAIN: 100% exact-string matches, no case/spelling drift),
  // so an exact-string lookup is a reliable match, not a fragile guess.
  // No hex/color-code metadata exists anywhere in the SanMar pipeline
  // for this product line -- color_name is the only identifier SanMar
  // itself provides, and it's already the shared key between the two
  // tables.
  const colorImagesByStyleId = new Map<number, Map<string, string>>();
  // Official SanMar swatch images (image_type='swatch' in
  // product_images) -- kept in a COMPLETELY SEPARATE map from
  // colorImagesByStyleId above on purpose. Both are sourced from the
  // same product_images table and the same query below, but a swatch
  // row must never be picked up by the hero/big-photo logic (which
  // filters it out explicitly) and a product photo must never be
  // mistaken for a swatch -- "swatches can never accidentally replace
  // large product previews." No swatch rows exist in production yet
  // (the monthly sync that would create them is a local, not-yet-run
  // script -- see sanmar_api/sync_sanmar_color_swatches.py), so this
  // map is empty in practice today; it's wired up now so the moment
  // real rows exist, this data layer already serves them correctly
  // without a second code change.
  const colorSwatchUrlsByStyleId = new Map<number, Map<string, string>>();

  if (pageSupplierProductIds.length > 0) {
    const [{ data: variantRows, error: variantError }, { data: imageRows, error: imageError }] = await Promise.all([
      supabaseAdmin
        .from("product_variants")
        .select("supplier_product_id, color_name, size_name")
        .in("supplier_product_id", pageSupplierProductIds)
        .eq("active", true),
      supabaseAdmin
        .from("product_images")
        .select("supplier_product_id, color_name, image_url, image_type, sort_order")
        .in("supplier_product_id", pageSupplierProductIds)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
    ]);

    if (variantError) throw new Error(`Failed to load variant colors/sizes: ${variantError.message}`);
    if (imageError) throw new Error(`Failed to load product images: ${imageError.message}`);

    for (const v of variantRows ?? []) {
      if (!colorsByStyleId.has(v.supplier_product_id)) colorsByStyleId.set(v.supplier_product_id, new Set());
      colorsByStyleId.get(v.supplier_product_id)!.add(v.color_name);
      if (!sizesByStyleId.has(v.supplier_product_id)) sizesByStyleId.set(v.supplier_product_id, new Set());
      if (v.size_name) sizesByStyleId.get(v.supplier_product_id)!.add(v.size_name);
    }

    for (const img of imageRows ?? []) {
      if (!img.supplier_product_id) continue;

      // Swatch rows are handled entirely separately and never fall
      // through to the product-photo logic below.
      if (img.image_type === "swatch") {
        if (img.color_name) {
          if (!colorSwatchUrlsByStyleId.has(img.supplier_product_id)) {
            colorSwatchUrlsByStyleId.set(img.supplier_product_id, new Map());
          }
          const swatchMap = colorSwatchUrlsByStyleId.get(img.supplier_product_id)!;
          if (!swatchMap.has(img.color_name)) {
            swatchMap.set(img.color_name, img.image_url);
          }
        }
        continue;
      }

      // First hero image wins; otherwise the first image at all
      // (already sorted by sort_order) -- same preference order as
      // components/ProductRow.tsx's selectThumbnail().
      const current = heroImageByStyleId.get(img.supplier_product_id);
      if (!current || img.image_type === "hero") {
        heroImageByStyleId.set(img.supplier_product_id, img.image_url);
      }

      // Per color_name, first image wins (sort_order ascending) -- a
      // color with no image row here simply has no entry, and the
      // modal falls back to heroImageUrl rather than guessing.
      if (img.color_name) {
        if (!colorImagesByStyleId.has(img.supplier_product_id)) {
          colorImagesByStyleId.set(img.supplier_product_id, new Map());
        }
        const colorMap = colorImagesByStyleId.get(img.supplier_product_id)!;
        if (!colorMap.has(img.color_name)) {
          colorMap.set(img.color_name, img.image_url);
        }
      }
    }
  }

  // Step 4: the store's current draft -- selectedCount is store-wide
  // (every page/filter), selectedColorsByStyleId is scoped to the
  // current page's styles only (all that's needed to render them).
  const [{ count: selectedCount, error: countError }, { data: pageDraftRows, error: pageDraftError }] =
    await Promise.all([
      supabaseAdmin
        .from("online_store_catalog_items")
        .select("id", { count: "exact", head: true })
        .eq("online_store_id", storeId),
      pageMeta.length > 0
        ? supabaseAdmin
            .from("online_store_catalog_items")
            .select("approved_catalog_style_id, color_name")
            .eq("online_store_id", storeId)
            .in("approved_catalog_style_id", pageMeta.map((s) => s.approvedCatalogStyleId))
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (countError) throw new Error(`Failed to load draft selection count: ${countError.message}`);
  if (pageDraftError) throw new Error(`Failed to load catalog draft: ${pageDraftError.message}`);

  const selectedColorsByStyleId = new Map<number, Set<string>>();
  for (const row of pageDraftRows ?? []) {
    if (!selectedColorsByStyleId.has(row.approved_catalog_style_id)) {
      selectedColorsByStyleId.set(row.approved_catalog_style_id, new Set());
    }
    selectedColorsByStyleId.get(row.approved_catalog_style_id)!.add(row.color_name);
  }

  const styles: CatalogStyleOption[] = pageMeta.map((style) => ({
    approvedCatalogStyleId: style.approvedCatalogStyleId,
    catalogProductId: style.catalogProductId,
    styleCode: style.styleCode,
    displayName: style.displayName,
    brandDisplay: style.brandDisplay,
    crossbarCategory: style.crossbarCategory,
    gender: style.gender,
    ageGroup: style.ageGroup,
    descriptionHtml: style.descriptionHtml,
    heroImageUrl: heroImageByStyleId.get(style.supplierProductId) ?? null,
    availableColors: Array.from(colorsByStyleId.get(style.supplierProductId) ?? []).sort(),
    availableSizes: Array.from(sizesByStyleId.get(style.supplierProductId) ?? []).sort(),
    colorImages: Object.fromEntries(colorImagesByStyleId.get(style.supplierProductId) ?? new Map()),
    colorSwatchUrls: Object.fromEntries(colorSwatchUrlsByStyleId.get(style.supplierProductId) ?? new Map()),
    selectedColors: Array.from(selectedColorsByStyleId.get(style.approvedCatalogStyleId) ?? []).sort(),
  }));

  return {
    storeId,
    storeName,
    facets,
    styles,
    totalMatching,
    page: safePage,
    pageSize,
    totalApprovedCount,
    selectedCount: selectedCount ?? 0,
  };
}

export async function getCustomerCatalogWorkspace(
  rawToken: string,
  filters: CatalogWorkspaceFilters = {}
): Promise<CatalogWorkspace | null> {
  const resolved = await resolveStoreOrNull(rawToken);
  if (!resolved) return null;
  const { storeId, tokenId } = resolved;

  const { data: store, error: storeError } = await supabaseAdmin
    .from("online_stores")
    .select("id, name, active")
    .eq("id", storeId)
    .maybeSingle();
  if (storeError || !store || !store.active) return null;

  await recordCatalogAccess(tokenId);

  return buildCatalogWorkspace(storeId, store.name, filters);
}

// Toggles one (style, color) in the customer's DRAFT only -- never
// touches online_store_catalog_baseline or any submission table.
// "Customer edits save to a draft without modifying the currently
// approved selections."
export async function saveCustomerCatalogDraftSelection(
  rawToken: string,
  approvedCatalogStyleId: number,
  colorName: string,
  selected: boolean
): Promise<{ ok: boolean }> {
  const resolved = await resolveStoreOrNull(rawToken);
  if (!resolved) return { ok: false };
  if (!Number.isSafeInteger(approvedCatalogStyleId) || approvedCatalogStyleId <= 0 || !colorName.trim()) {
    return { ok: false };
  }

  if (selected) {
    const { error } = await supabaseAdmin.from("online_store_catalog_items").upsert(
      {
        online_store_id: resolved.storeId,
        approved_catalog_style_id: approvedCatalogStyleId,
        color_name: colorName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "online_store_id,approved_catalog_style_id,color_name" }
    );
    if (error) return { ok: false };
  } else {
    const { error } = await supabaseAdmin
      .from("online_store_catalog_items")
      .delete()
      .eq("online_store_id", resolved.storeId)
      .eq("approved_catalog_style_id", approvedCatalogStyleId)
      .eq("color_name", colorName);
    if (error) return { ok: false };
  }

  return { ok: true };
}

// Backs the "Review Selections" screen -- every currently-selected
// (style, color) pair for this store, WITH display names/style codes,
// regardless of which page/filter the customer was browsing when they
// selected it. Fetched on demand (only when the review panel opens),
// never on every catalog page load -- keeps the main browse request
// cheap per the "support hundreds of products efficiently" goal.
export async function getCustomerDraftSummary(rawToken: string): Promise<CatalogDraftSummaryItem[] | null> {
  const resolved = await resolveStoreOrNull(rawToken);
  if (!resolved) return null;
  return getDraftSummaryForStore(resolved.storeId);
}

type DraftSummaryRow = {
  approved_catalog_style_id: number;
  color_name: string;
  approved_catalog_styles: {
    style_code: string;
    supplier_products: {
      catalog_products: { display_name: string; brand_display: string | null } | { display_name: string; brand_display: string | null }[];
    } | { supplier_products: unknown }[] | null;
  } | null;
};

async function getDraftSummaryForStore(storeId: number): Promise<CatalogDraftSummaryItem[]> {
  const { data, error } = await supabaseAdmin
    .from("online_store_catalog_items")
    .select(
      `
      approved_catalog_style_id, color_name,
      approved_catalog_styles (
        style_code,
        supplier_products ( catalog_products ( display_name, brand_display ) )
      )
    `
    )
    .eq("online_store_id", storeId)
    .order("approved_catalog_style_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load draft summary: ${error.message}`);
  }

  return ((data ?? []) as unknown as DraftSummaryRow[]).map((row) => {
    const style = firstRelated(row.approved_catalog_styles);
    const sp = firstRelated(
      style?.supplier_products as
        | { catalog_products: { display_name: string; brand_display: string | null } | { display_name: string; brand_display: string | null }[] }
        | { catalog_products: { display_name: string; brand_display: string | null } | { display_name: string; brand_display: string | null }[] }[]
        | undefined
    );
    const cp = firstRelated(sp?.catalog_products);
    return {
      approvedCatalogStyleId: row.approved_catalog_style_id,
      styleCode: style?.style_code ?? "",
      displayName: cp?.display_name ?? `Style #${row.approved_catalog_style_id}`,
      brandDisplay: cp?.brand_display ?? null,
      colorName: row.color_name,
    };
  });
}

export type SubmitCatalogForReviewResult =
  | { outcome: "submitted"; submissionId: number }
  | { outcome: "nothing-to-submit" }
  // The store already has a submission with status 'pending' --
  // see database/migrations/
  // 20261114_add_unique_active_catalog_submission_per_store.sql.
  | { outcome: "already-pending" };

// Freezes the diff between the current draft and the current approved
// baseline into a new submission + submission_items snapshot. Refuses
// with "nothing-to-submit" if draft and baseline are identical, rather
// than creating an empty, pointless review request.
//
// Duplicate-submission protection is NOT a read-before-write check
// (that would not be race-safe under two concurrent requests for the
// same store, e.g. a double-click or two open tabs) -- the INSERT
// below is itself the check. Once the partial unique index in the
// migration above is applied, Postgres rejects a second concurrent
// active submission for the same store with a unique_violation, which
// is caught via isUniqueViolationError() and reported as
// "already-pending." Until that migration is applied, this still
// behaves exactly as before (no blocking) -- this function never
// relies on the index existing to behave correctly for the normal,
// non-racing case.
export async function submitCustomerCatalogForReview(
  rawToken: string,
  submittedByName?: string
): Promise<SubmitCatalogForReviewResult | null> {
  const resolved = await resolveStoreOrNull(rawToken);
  if (!resolved) return null;

  const [{ data: draftRows, error: draftError }, { data: baselineRows, error: baselineError }] = await Promise.all([
    supabaseAdmin
      .from("online_store_catalog_items")
      .select("approved_catalog_style_id, color_name")
      .eq("online_store_id", resolved.storeId),
    supabaseAdmin
      .from("online_store_catalog_baseline")
      .select("approved_catalog_style_id, color_name")
      .eq("online_store_id", resolved.storeId),
  ]);

  if (draftError || baselineError) {
    throw new Error("Failed to load current catalog state for submission.");
  }

  const draftItems: CatalogItemKey[] = (draftRows ?? []).map((r) => ({
    approvedCatalogStyleId: r.approved_catalog_style_id,
    colorName: r.color_name,
  }));
  const baselineItems: CatalogItemKey[] = (baselineRows ?? []).map((r) => ({
    approvedCatalogStyleId: r.approved_catalog_style_id,
    colorName: r.color_name,
  }));

  if (catalogDiffIsEmpty(draftItems, baselineItems)) {
    return { outcome: "nothing-to-submit" };
  }

  const diff = computeCatalogDiff(draftItems, baselineItems);

  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("online_store_catalog_submissions")
    .insert({
      online_store_id: resolved.storeId,
      submitted_by: submittedByName?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (submissionError) {
    if (isUniqueViolationError(submissionError)) {
      return { outcome: "already-pending" };
    }
    throw new Error("Failed to create catalog submission.");
  }
  if (!submission) {
    throw new Error("Failed to create catalog submission.");
  }

  const { error: itemsError } = await supabaseAdmin.from("online_store_catalog_submission_items").insert(
    diff.map((d) => ({
      submission_id: submission.id,
      approved_catalog_style_id: d.approvedCatalogStyleId,
      color_name: d.colorName,
      change_type: d.changeType,
    }))
  );

  if (itemsError) {
    // Compensate: a submission row with zero items can never be
    // decided by a reviewer, and -- once the partial unique index
    // above is applied -- would permanently block this store from
    // ever submitting again. Removing it here keeps this failure mode
    // exactly as recoverable as it was before that constraint existed.
    await supabaseAdmin.from("online_store_catalog_submissions").delete().eq("id", submission.id);
    throw new Error("Failed to record catalog submission items.");
  }

  return { outcome: "submitted", submissionId: submission.id };
}

// Customer-facing view of "what happened to my submitted changes" --
// task 1: "show pending, approved, and rejected decisions for
// submitted catalog items" + "display staff rejection notes when
// available." Fetched on demand alongside the draft summary (same
// on-open timing as getCustomerDraftSummary), never on every browse
// request.
export async function getCustomerSubmissionStatus(rawToken: string): Promise<CatalogSubmissionStatusItem[] | null> {
  const resolved = await resolveStoreOrNull(rawToken);
  if (!resolved) return null;
  return getSubmissionStatusForStore(resolved.storeId);
}

type SubmissionStatusRow = {
  submission_id: number;
  approved_catalog_style_id: number;
  color_name: string;
  change_type: "added" | "removed";
  decision: "pending" | "approved" | "rejected";
  decision_notes: string | null;
  decided_at: string | null;
  approved_catalog_styles: {
    style_code: string;
    supplier_products: {
      catalog_products: { display_name: string } | { display_name: string }[];
    } | { supplier_products: unknown }[] | null;
  } | null;
};

async function getSubmissionStatusForStore(storeId: number): Promise<CatalogSubmissionStatusItem[]> {
  const { data: submissions, error: submissionsError } = await supabaseAdmin
    .from("online_store_catalog_submissions")
    .select("id, submitted_at")
    .eq("online_store_id", storeId);

  if (submissionsError) {
    throw new Error(`Failed to load submissions for store ${storeId}: ${submissionsError.message}`);
  }
  if (!submissions || submissions.length === 0) return [];

  const submittedAtBySubmissionId = new Map(submissions.map((s) => [s.id, s.submitted_at]));

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("online_store_catalog_submission_items")
    .select(
      `
      submission_id, approved_catalog_style_id, color_name, change_type, decision, decision_notes, decided_at,
      approved_catalog_styles (
        style_code,
        supplier_products ( catalog_products ( display_name ) )
      )
    `
    )
    .in(
      "submission_id",
      submissions.map((s) => s.id)
    );

  if (itemsError) {
    throw new Error(`Failed to load submission items for store ${storeId}: ${itemsError.message}`);
  }

  const rawRows: RawSubmissionStatusRow[] = ((items ?? []) as unknown as SubmissionStatusRow[]).map((row) => {
    const style = firstRelated(row.approved_catalog_styles);
    const sp = firstRelated(
      style?.supplier_products as
        | { catalog_products: { display_name: string } | { display_name: string }[] }
        | { catalog_products: { display_name: string } | { display_name: string }[] }[]
        | undefined
    );
    const cp = firstRelated(sp?.catalog_products);
    return {
      approvedCatalogStyleId: row.approved_catalog_style_id,
      colorName: row.color_name,
      changeType: row.change_type,
      decision: row.decision,
      decisionNotes: row.decision_notes,
      decidedAt: row.decided_at,
      submissionId: row.submission_id,
      submittedAt: submittedAtBySubmissionId.get(row.submission_id) ?? "",
      styleCode: style?.style_code ?? "",
      displayName: cp?.display_name ?? `Style #${row.approved_catalog_style_id}`,
    };
  });

  return pickLatestSubmissionStatus(rawRows)
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0))
    .map((r) => ({
      approvedCatalogStyleId: r.approvedCatalogStyleId,
      styleCode: r.styleCode,
      displayName: r.displayName,
      colorName: r.colorName,
      changeType: r.changeType,
      decision: r.decision,
      decisionNotes: r.decisionNotes,
      decidedAt: r.decidedAt,
      submittedAt: r.submittedAt,
    }));
}

// Staff-facing preview (Team Store Ready integration, "make it easy
// to preview the customer-facing catalog"): shares
// buildCatalogWorkspace() with the real customer path above, so staff
// see EXACTLY what a customer would see -- never a second,
// independently-maintained read path. Gated by requireStaffSession(),
// never a token; there is no code path here that reads or exposes a
// customer's raw access token to retrieve this.
export async function getStoreCatalogPreview(
  storeId: number,
  filters: CatalogWorkspaceFilters = {}
): Promise<CatalogWorkspace | null> {
  await requireStaffSession();
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return null;

  const { data: store, error } = await supabaseAdmin
    .from("online_stores")
    .select("id, name, active")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !store) return null;

  return buildCatalogWorkspace(storeId, store.name, filters);
}

// Backs the Catalog tab's "Draft & Submission Status" summary
// (staff-facing): how many items are currently in the store's
// customer-facing DRAFT right now, regardless of whether anything has
// ever been submitted.
export async function getStoreDraftItemCount(storeId: number): Promise<number> {
  await requireStaffSession();
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return 0;

  const { count, error } = await supabaseAdmin
    .from("online_store_catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("online_store_id", storeId);

  if (error) {
    throw new Error(`Failed to load draft item count for store ${storeId}: ${error.message}`);
  }
  return count ?? 0;
}
