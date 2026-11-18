"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import { parseStyleCodeInput, matchStyleCodes } from "@/lib/approvedCatalogStyleImportLogic";
import type { ApprovedCatalogStyle, ApprovedCatalogStyleImportReport } from "@/lib/approvedCatalogStyleTypes";

// Server-only data access for the Online Store Builder's GLOBAL
// approved master catalog (task requirement 1). Mirrors
// lib/onlineStoreData.ts's own pattern exactly: requireStaffSession()
// first, every read/write through supabaseAdmin (approved_catalog_styles
// has RLS enabled with zero anon/authenticated policies -- see
// database/migrations/20261111_add_approved_catalog_styles.sql).
//
// PostgREST's .in() filter is sent as a single query string -- for a
// very large pasted list this is chunked (CHUNK_SIZE) the same way
// sanmar_api's own batch sync work chunks large ID lists, so a staff
// member pasting thousands of codes at once can't produce one
// oversized request.
const CHUNK_SIZE = 300;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function listApprovedCatalogStyles(options?: {
  query?: string;
  activeOnly?: boolean;
}): Promise<ApprovedCatalogStyle[]> {
  await requireStaffSession();

  let request = supabaseAdmin
    .from("approved_catalog_styles")
    .select(
      `
      id, supplier_id, supplier_product_id, style_code, active, added_by, created_at, updated_at,
      supplier_products (
        catalog_product_id,
        catalog_products ( display_name, brand_display, crossbar_category )
      )
    `
    )
    .order("created_at", { ascending: false });

  if (options?.activeOnly) {
    request = request.eq("active", true);
  }
  if (options?.query && options.query.trim()) {
    const escaped = options.query.trim().replace(/[%_,]/g, (match) => `\\${match}`);
    request = request.ilike("style_code", `%${escaped}%`);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`Failed to load approved catalog styles: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    // Supabase's generated types for a nested !inner-less join return
    // the related row as an array in some client versions and an
    // object in others depending on cardinality inference -- normalize
    // defensively rather than assume one shape.
    const sp = Array.isArray(row.supplier_products) ? row.supplier_products[0] : row.supplier_products;
    const cpRaw = sp?.catalog_products;
    const cp = Array.isArray(cpRaw) ? cpRaw[0] : cpRaw;
    return {
      id: row.id,
      supplierId: row.supplier_id,
      supplierProductId: row.supplier_product_id,
      styleCode: row.style_code,
      active: row.active,
      addedBy: row.added_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      catalogProductId: sp?.catalog_product_id ?? null,
      displayName: cp?.display_name ?? null,
      brandDisplay: cp?.brand_display ?? null,
      crossbarCategory: cp?.crossbar_category ?? null,
    };
  });
}

// The bulk importer. Pure parsing/matching logic lives in
// lib/approvedCatalogStyleImportLogic.ts (unit-tested, no database
// dependency) -- this function is the thin orchestration around it:
// load candidates, load what's already approved, match, insert.
export async function bulkImportApprovedCatalogStyles(
  rawInput: string
): Promise<ApprovedCatalogStyleImportReport> {
  const session = await requireStaffSession();

  const { codes, duplicatesRemoved } = parseStyleCodeInput(rawInput);
  if (codes.length === 0) {
    return { added: [], alreadyApproved: [], unmatched: [], duplicatesRemoved };
  }

  const candidatesByStyleCode = new Map<string, { supplierProductId: number; supplierId: number }>();
  for (const codeChunk of chunk(codes, CHUNK_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("supplier_products")
      .select("id, supplier_id, supplier_style")
      .in("supplier_style", codeChunk);

    if (error) {
      throw new Error(`Failed to look up supplier products: ${error.message}`);
    }

    for (const row of data ?? []) {
      // Exact match only -- supplier_style is used verbatim as the map
      // key, never trimmed/cased again here (lib/approvedCatalogStyleImportLogic.ts's
      // matchStyleCodes() is itself exact-string-equality only).
      candidatesByStyleCode.set(row.supplier_style, { supplierProductId: row.id, supplierId: row.supplier_id });
    }
  }

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("approved_catalog_styles")
    .select("supplier_product_id");
  if (existingError) {
    throw new Error(`Failed to load existing approved styles: ${existingError.message}`);
  }
  const alreadyApprovedIds = new Set((existingRows ?? []).map((r) => r.supplier_product_id));

  const { matched, unmatched, alreadyApproved } = matchStyleCodes(codes, candidatesByStyleCode, alreadyApprovedIds);

  const rowsToInsert = Array.from(matched.entries()).map(([styleCode, candidate]) => ({
    supplier_id: candidate.supplierId,
    supplier_product_id: candidate.supplierProductId,
    style_code: styleCode,
    added_by: session.email,
  }));

  const added: string[] = [];
  for (const rowChunk of chunk(rowsToInsert, CHUNK_SIZE)) {
    if (rowChunk.length === 0) continue;
    const { data, error } = await supabaseAdmin
      .from("approved_catalog_styles")
      .insert(rowChunk)
      .select("style_code");
    if (error) {
      throw new Error(`Failed to insert approved catalog styles: ${error.message}`);
    }
    added.push(...(data ?? []).map((r) => r.style_code));
  }

  return { added, alreadyApproved, unmatched, duplicatesRemoved };
}

export async function setApprovedCatalogStyleActive(id: number, active: boolean): Promise<void> {
  await requireStaffSession();
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Invalid approved catalog style id.");
  }

  const { error } = await supabaseAdmin
    .from("approved_catalog_styles")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update approved catalog style ${id}: ${error.message}`);
  }

  // Refreshes the Catalog Manager's Team Store Ready tab (list +
  // CatalogViewTabs badge count) and the approved-styles management
  // list on the same page -- both read this table. Next's Server
  // Action plumbing re-renders the CURRENT page's server components
  // after this resolves, the same mechanism
  // app/(internal)/products/catalog-actions.ts's revalidateCatalog()
  // already relies on for Archive/team_store_enabled.
  revalidatePath("/products");
}

// "Remove from Team Stores" (Catalog Manager Team Store Ready tab,
// per-row action): deactivates every approved_catalog_styles row tied
// to one catalog_products.id, in one call. ALWAYS deactivates
// (active = false) -- NEVER deletes. This distinction is safety-
// critical, not stylistic: approved_catalog_styles is the parent of
// online_store_catalog_items/_baseline/_submission_items, all declared
// `on delete cascade` (see database/migrations/20261111b_...). A hard
// delete here would silently cascade-delete any store's already-
// APPROVED baseline entry and historical submission records for this
// style -- exactly what task requirement 9 prohibits ("if a style is
// already used in an approved store catalog, do not silently remove it
// from that store"). Deactivating only flips a boolean column; nothing
// referencing this row via FK is touched, so an existing store's
// baseline (and its customers' already-approved selection) is
// completely unaffected -- only FUTURE customer selection of this style
// (via the customer catalog's own active=true filter, see
// lib/onlineStoreCatalogCustomerData.ts) and this Team Store Ready tab
// (see getApprovedStyleCatalogProductIds() above) stop offering it.
export async function removeCatalogProductFromTeamStores(approvedCatalogStyleIds: number[]): Promise<void> {
  await requireStaffSession();

  const ids = approvedCatalogStyleIds.filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.length === 0) {
    throw new Error("No valid approved catalog style ids provided.");
  }

  const { error } = await supabaseAdmin
    .from("approved_catalog_styles")
    .update({ active: false, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    throw new Error(`Failed to remove from team stores: ${error.message}`);
  }

  revalidatePath("/products");
}

// Backs the Team Store Ready tab's per-row "Remove from Team Stores"
// button: maps each catalog_products.id currently eligible (via
// getApprovedStyleCatalogProductIds()) to the full list of
// approved_catalog_styles.id rows that make it so -- usually one, but
// a catalog product can in principle be backed by more than one
// supplier_products row, each independently approved. Passed down
// through ProductTable -> ProductTableClient -> ProductRow so the
// button knows exactly which row(s) to deactivate for THIS product,
// without ProductRow (a component also used, unmodified, by the
// Collection product picker) needing any awareness of
// approved_catalog_styles itself.
export async function getApprovedCatalogStyleIdsByCatalogProductId(): Promise<Record<number, number[]>> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("approved_catalog_styles")
    .select("id, supplier_products ( catalog_product_id )")
    .eq("active", true);

  if (error) {
    throw new Error(`Failed to load approved style ids by product: ${error.message}`);
  }

  const map: Record<number, number[]> = {};
  for (const row of data ?? []) {
    const sp = Array.isArray(row.supplier_products) ? row.supplier_products[0] : row.supplier_products;
    const catalogProductId = sp?.catalog_product_id;
    if (catalogProductId) {
      (map[catalogProductId] ??= []).push(row.id);
    }
  }
  return map;
}

// The single authoritative source of customer catalog eligibility
// (Online Store Builder integration task, requirement 3): returns
// every catalog_products.id that currently has at least one ACTIVE
// approved_catalog_styles entry. Deliberately separate from, and never
// synchronized with, catalog_settings.team_store_enabled -- a
// pre-existing, unrelated staff workflow flag (set via the Catalog
// Manager's own bulk action, bulkSetTeamStoreEnabled in
// app/(internal)/products/catalog-actions.ts) that keeps its own
// meaning. See lib/catalogViews.ts's own comment on the
// "team-store-ready" view for the full explanation of why these two
// concepts are intentionally NOT merged.
//
// Consumed by lib/catalogProductData.ts's queryProducts()/
// getCatalogViewCounts() -- the Catalog Manager's own Team Store Ready
// tab opts into this source explicitly (via the useApprovedStyleSource
// filter flag); every other existing caller of queryProducts() (e.g.
// the Collection product picker) is unaffected and keeps reading
// team_store_enabled exactly as before.
export async function getApprovedStyleCatalogProductIds(): Promise<number[]> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("approved_catalog_styles")
    .select("supplier_products ( catalog_product_id )")
    .eq("active", true);

  if (error) {
    throw new Error(`Failed to load approved style catalog product ids: ${error.message}`);
  }

  const ids = new Set<number>();
  for (const row of data ?? []) {
    const sp = Array.isArray(row.supplier_products) ? row.supplier_products[0] : row.supplier_products;
    if (sp?.catalog_product_id) {
      ids.add(sp.catalog_product_id);
    }
  }
  return Array.from(ids);
}

// A hard delete -- only ever removes a row in THIS table (see the
// migration's own comment); supplier_products/catalog_products/
// product_variants are never touched by this function.
//
// NEVER call this directly from UI code anymore -- it is only safe
// when NOTHING references this row (see
// removeOrDeactivateApprovedCatalogStyle() below, which checks that
// first and is what the approved-styles management list actually
// calls). approved_catalog_styles is the parent of
// online_store_catalog_items/_baseline/_submission_items, all
// declared `on delete cascade` -- deleting a row that's already in
// use by a store would silently cascade-delete that store's approved
// baseline entry and historical submission records for this style.
// Kept exported (rather than removed outright) only because
// removeOrDeactivateApprovedCatalogStyle() still needs to call it for
// the genuinely-unreferenced case.
async function removeApprovedCatalogStyle(id: number): Promise<void> {
  await requireStaffSession();
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Invalid approved catalog style id.");
  }

  const { error } = await supabaseAdmin.from("approved_catalog_styles").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to remove approved catalog style ${id}: ${error.message}`);
  }
  revalidatePath("/products");
}

// The ONLY "remove" entry point the approved-styles management UI
// should call (components/ApprovedStyleRow.tsx). Checks, first,
// whether ANYTHING in the Online Store Builder's per-store tables
// (online_store_catalog_items, _baseline, or _submission_items)
// references this approved_catalog_styles row -- a style a customer
// has drafted/had approved/submitted. If so, a hard delete is NEVER
// attempted (it would cascade-delete that store's history, exactly
// what task requirement 9 prohibits) -- this falls back to the same
// safe deactivation setApprovedCatalogStyleActive() already provides.
// Only a genuinely never-used style (zero references anywhere) is
// actually deleted.
export async function removeOrDeactivateApprovedCatalogStyle(
  id: number
): Promise<{ action: "deleted" | "deactivated" }> {
  await requireStaffSession();
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Invalid approved catalog style id.");
  }

  const [itemsCheck, baselineCheck, submissionItemsCheck] = await Promise.all([
    supabaseAdmin
      .from("online_store_catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("approved_catalog_style_id", id),
    supabaseAdmin
      .from("online_store_catalog_baseline")
      .select("id", { count: "exact", head: true })
      .eq("approved_catalog_style_id", id),
    supabaseAdmin
      .from("online_store_catalog_submission_items")
      .select("id", { count: "exact", head: true })
      .eq("approved_catalog_style_id", id),
  ]);

  if (itemsCheck.error || baselineCheck.error || submissionItemsCheck.error) {
    throw new Error("Failed to check whether this style is in use before removing it.");
  }

  const isReferenced =
    (itemsCheck.count ?? 0) > 0 || (baselineCheck.count ?? 0) > 0 || (submissionItemsCheck.count ?? 0) > 0;

  if (isReferenced) {
    await setApprovedCatalogStyleActive(id, false);
    return { action: "deactivated" };
  }

  await removeApprovedCatalogStyle(id);
  return { action: "deleted" };
}
