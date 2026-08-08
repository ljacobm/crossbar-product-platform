// Pure parsing helpers for normalizing Shopify order webhook data. Kept
// dependency-free and side-effect-free so they can be reused outside the
// webhook route (e.g. a future backfill/reparse script) and reasoned about
// independently of any database or HTTP concerns.

// Line items with this exact Vendor are Crossbar's own add-ons (player name,
// number, etc.), not a team/store's product -- see CROSSBAR-addon handling
// in the webhook ingest logic.
export const CROSSBAR_ADDON_VENDOR = "Crossbar Athletics";

export function isCrossbarAddon(vendor: string | null | undefined): boolean {
  return vendor?.trim() === CROSSBAR_ADDON_VENDOR;
}

// Splits a Shopify line item's Vendor string into a team/store tag and an
// item number, e.g. "North Cheektowaga Amateur Athletic Association NKDH7709"
// -> { teamTag: "North Cheektowaga Amateur Athletic Association",
//      itemNumber: "NKDH7709" }.
// The item number is identified as the first whitespace-separated word that
// contains a digit; everything before it is the team tag.
export function parseVendor(
  vendor: string | null | undefined
): { teamTag: string | null; itemNumber: string | null } {
  if (!vendor) return { teamTag: null, itemNumber: null };

  const vendorWords = vendor.trim().split(/\s+/).filter(Boolean);
  const indexOfItemNumber = vendorWords.findIndex((word) => /\d/.test(word));

  if (indexOfItemNumber !== -1) {
    return {
      teamTag: vendorWords.slice(0, indexOfItemNumber).join(" "),
      itemNumber: vendorWords.slice(indexOfItemNumber).join(" "),
    };
  }

  // No digit-containing word found -- can't identify where an item number
  // would start. Preserve the full vendor string as the team tag rather than
  // discarding it, so the row stays identifiable for later manual review.
  return { teamTag: vendor.trim(), itemNumber: null };
}

// Splits a Shopify variant_title into color/size, applying the heuristic
// only when it's actually unambiguous. variant_title is the product's option
// values joined by " / ", in that product's own configured option order --
// there's no Shopify-wide guarantee it's always "Color / Size", and a single
// part is often Shopify's "Default Title" sentinel for products with no real
// options. Only the well-understood 2-part case is split; 1-part (including
// "Default Title") and 3+-part titles are left null rather than guessed --
// the raw variant_title is always preserved separately, so no data is lost.
export function parseVariantTitle(
  variantTitle: string | null | undefined
): { color: string | null; size: string | null } {
  if (!variantTitle) return { color: null, size: null };

  const parts = variantTitle
    .split(" / ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    return { color: parts[0], size: parts[1] };
  }

  return { color: null, size: null };
}

type LineItemProperty = { name?: string | null; value?: string | null };

// Flattens Shopify line item properties (e.g. personalization like player
// name/number) into a human-readable string for display/search without
// parsing JSONB. Properties whose name starts with "_" are Shopify's/our
// existing Apps Script convention for hidden properties and are excluded
// from this flattened string -- they are NOT removed from the full
// properties array or raw_data, both of which always preserve everything.
export function buildPropertiesText(
  properties: LineItemProperty[] | null | undefined
): string | null {
  if (!properties || properties.length === 0) return null;

  const parts = properties
    .filter(
      (prop) =>
        prop &&
        prop.name &&
        !prop.name.startsWith("_") &&
        prop.value != null &&
        prop.value !== ""
    )
    .map((prop) => `${prop.name}: ${prop.value}`);

  return parts.length > 0 ? parts.join(", ") : null;
}
