// Shared shape for approved_catalog_styles rows, joined with enough of
// catalog_products/supplier_products for the admin list UI to render
// without a second round-trip. Kept in its own plain module -- a
// "use server" file may only export async functions, not types (see
// lib/onlineStoreTypes.ts for the same convention already in use).

export interface ApprovedCatalogStyle {
  id: number;
  supplierId: number;
  supplierProductId: number;
  styleCode: string;
  active: boolean;
  addedBy: string | null;
  createdAt: string;
  updatedAt: string;
  catalogProductId: number | null;
  displayName: string | null;
  brandDisplay: string | null;
  crossbarCategory: string | null;
}

export interface ApprovedCatalogStyleImportReport {
  // Codes that matched a real supplier_products row AND were newly
  // inserted this run.
  added: string[];
  // Codes that matched but were already on the approved list (active
  // or not) -- not re-inserted, not an error.
  alreadyApproved: string[];
  // Codes with no exact match at all -- task requirement: report
  // these back rather than inventing or guessing.
  unmatched: string[];
  // Exact-duplicate strings within the pasted input itself (after
  // trimming), reported once each regardless of repeat count.
  duplicatesRemoved: string[];
}
