// Shared shapes for the Online Store Builder's per-store catalog
// (approved baseline, customer draft, submissions/review). Kept in its
// own plain module -- see lib/onlineStoreTypes.ts for the same
// convention already used elsewhere in this codebase.

export interface CatalogStyleOption {
  approvedCatalogStyleId: number;
  catalogProductId: number;
  styleCode: string;
  displayName: string;
  brandDisplay: string | null;
  crossbarCategory: string | null;
  gender: string | null;
  ageGroup: string | null;
  descriptionHtml: string | null;
  heroImageUrl: string | null;
  // Every color this style is actually available in (distinct
  // product_variants.color_name for the underlying supplier_product),
  // not filtered by current stock -- requirement 3 only asks that
  // customers "select multiple available colors," not that out-of-
  // stock colors be hidden; inventory-aware filtering is a reasonable
  // future refinement, not required for this foundation.
  availableColors: string[];
  // Every distinct size across all colors for this style (not
  // filtered by current stock, same reasoning as availableColors --
  // and not broken down per-color, since SanMar's own size run can
  // differ slightly by color and this is a browse-time overview, not
  // a live inventory check).
  availableSizes: string[];
  // The CURRENT DRAFT's selected colors for this style, for the
  // requesting store -- empty if this style isn't in the draft at all.
  selectedColors: string[];
  // color_name -> image_url, for colors that have their own SanMar
  // garment photo (product_images.color_name, same text domain as
  // product_variants.color_name). A color with no entry here has no
  // color-specific photo; callers fall back to heroImageUrl rather
  // than guessing.
  colorImages: Record<string, string>;
  // color_name -> official SanMar swatch image URL
  // (product_images rows with image_type='swatch', built from a
  // completely SEPARATE map than colorImages above, from the SAME
  // query -- never the other's source of truth, so a swatch can never
  // be picked up as a big product photo or vice versa). Empty for
  // every style until the monthly swatch sync
  // (sanmar_api/sync_sanmar_color_swatches.py) actually runs against
  // a real target; callers fall back to the existing static
  // lib/colorSwatchLogic.ts hex table, then the neutral-gray dot,
  // exactly as before -- this field only adds a new, higher-priority
  // tier in front of that existing fallback chain, never replaces it.
  colorSwatchUrls: Record<string, string>;
}

export interface CatalogFacetOption {
  value: string;
  count: number;
}

export interface CatalogFacets {
  categories: CatalogFacetOption[];
  brands: CatalogFacetOption[];
  genders: CatalogFacetOption[];
  ageGroups: CatalogFacetOption[];
}

export type CatalogSortOption = "name-asc" | "brand-asc" | "category-asc" | "newest";

export interface CatalogDraftSummaryItem {
  approvedCatalogStyleId: number;
  styleCode: string;
  displayName: string;
  brandDisplay: string | null;
  colorName: string;
}

export interface CatalogBaselineItem {
  approvedCatalogStyleId: number;
  displayName: string;
  colorName: string;
  approvedAt: string;
  approvedBy: string | null;
  shopifyPublishStatus: string;
}

export type CatalogSubmissionStatus = "pending" | "approved" | "rejected" | "partially_approved";
export type CatalogSubmissionItemDecision = "pending" | "approved" | "rejected";
export type CatalogChangeType = "added" | "removed";

export interface CatalogSubmissionItem {
  id: number;
  approvedCatalogStyleId: number;
  displayName: string;
  colorName: string;
  changeType: CatalogChangeType;
  decision: CatalogSubmissionItemDecision;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface CatalogSubmission {
  id: number;
  onlineStoreId: number;
  submittedAt: string;
  submittedBy: string | null;
  status: CatalogSubmissionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  items: CatalogSubmissionItem[];
}

// Customer-facing view of "what happened to something I submitted" --
// one entry per (style, color, changeType), collapsed down to only the
// MOST RECENT submission's row when the same triple was submitted more
// than once across a store's history (see
// lib/onlineStoreCatalogSubmissionStatusLogic.ts's pickLatestSubmissionStatus).
export interface CatalogSubmissionStatusItem {
  approvedCatalogStyleId: number;
  styleCode: string;
  displayName: string;
  colorName: string;
  changeType: CatalogChangeType;
  decision: CatalogSubmissionItemDecision;
  decisionNotes: string | null;
  decidedAt: string | null;
  submittedAt: string;
}

export interface CatalogSubmissionListEntry {
  id: number;
  onlineStoreId: number;
  onlineStoreName: string;
  submittedAt: string;
  submittedBy: string | null;
  status: CatalogSubmissionStatus;
  addedCount: number;
  removedCount: number;
  pendingItemCount: number;
}
