// Pure logic for computing the added/removed diff between a store's
// current DRAFT (online_store_catalog_items) and its current APPROVED
// BASELINE (online_store_catalog_baseline) at the moment a customer
// clicks "submit for review" -- task requirement 5: "Track additions,
// removals, and color changes." No Supabase/network dependency; see
// scripts/verifyOnlineStoreCatalogDiffLogic.ts.
//
// A (style, color) pair present in the draft but not the baseline is
// an "added" item. A pair present in the baseline but not the draft is
// a "removed" item. A "color change" for a style -- e.g. swapping Navy
// for Black -- is NOT a distinct third kind of diff entry: it decomposes
// naturally into one "removed" (Navy) and one "added" (Black) at this
// same (style, color) granularity, exactly matching
// online_store_catalog_submission_items' own two-value change_type
// check constraint. Reviewing an "added" and a "removed" row
// independently is also strictly more flexible for Crossbar staff than
// a bundled "changed" entry would be -- e.g. approving the removal of
// an old color while rejecting the specific new one requested.

export interface CatalogItemKey {
  approvedCatalogStyleId: number;
  colorName: string;
}

export interface CatalogDiffItem extends CatalogItemKey {
  changeType: "added" | "removed";
}

function keyOf(item: CatalogItemKey): string {
  return `${item.approvedCatalogStyleId}::${item.colorName}`;
}

export function computeCatalogDiff(
  draftItems: CatalogItemKey[],
  baselineItems: CatalogItemKey[]
): CatalogDiffItem[] {
  const baselineKeys = new Set(baselineItems.map(keyOf));
  const draftKeys = new Set(draftItems.map(keyOf));

  const diff: CatalogDiffItem[] = [];

  for (const item of draftItems) {
    if (!baselineKeys.has(keyOf(item))) {
      diff.push({ ...item, changeType: "added" });
    }
  }

  for (const item of baselineItems) {
    if (!draftKeys.has(keyOf(item))) {
      diff.push({ ...item, changeType: "removed" });
    }
  }

  return diff;
}

// True only when the draft and baseline are IDENTICAL sets (same
// (style, color) pairs, regardless of order) -- used to refuse a
// "submit for review" click that has nothing to actually submit,
// rather than creating an empty, pointless submission row.
export function catalogDiffIsEmpty(draftItems: CatalogItemKey[], baselineItems: CatalogItemKey[]): boolean {
  return computeCatalogDiff(draftItems, baselineItems).length === 0;
}
