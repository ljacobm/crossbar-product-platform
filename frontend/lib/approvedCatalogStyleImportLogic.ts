// Pure logic for the Online Store Builder's approved-master-catalog
// bulk importer (task requirement 1: "Support bulk importing a list of
// style codes, trimming whitespace, deduplicating, exact matching, and
// reporting unmatched styles. Keep numeric-looking codes as strings.").
// No Supabase/network dependency -- see scripts/verifyApprovedCatalogStyleImportLogic.ts
// for its own standalone verification, matching this repo's convention
// (no test framework is installed; see that file's header comment).
//
// "Keep numeric-looking codes as strings": every function here takes
// and returns `string` only -- there is no code path anywhere in this
// module (or its caller, lib/approvedCatalogStyleData.ts) that ever
// parses a style code with Number()/parseInt() or similar. A style
// code like "1223" stays the exact string "1223", never becomes the
// number 1223 (which would silently lose a leading zero, e.g. "007",
// if SanMar ever used one).

export interface ParsedStyleCodeInput {
  // Trimmed, deduplicated, in first-seen order -- the list to actually
  // attempt matching against supplier_products.
  codes: string[];
  // Exact duplicate strings (post-trim) that were dropped, each listed
  // once regardless of how many extra times it appeared -- reported
  // back to the admin so a pasted list with repeats is transparent,
  // not silently shrunk with no explanation.
  duplicatesRemoved: string[];
}

// Splits on newlines, commas, AND semicolons -- staff may paste a
// one-per-line list (e.g. copied from a spreadsheet column) or a
// comma/semicolon-separated list (e.g. typed inline) interchangeably;
// this accepts both without requiring a specific format.
const SPLIT_PATTERN = /[\n\r,;]+/;

export function parseStyleCodeInput(raw: string): ParsedStyleCodeInput {
  const seen = new Set<string>();
  const codes: string[] = [];
  const duplicatesRemoved: string[] = [];
  const duplicatesSeen = new Set<string>();

  for (const piece of raw.split(SPLIT_PATTERN)) {
    const trimmed = piece.trim();
    if (!trimmed) continue;

    if (seen.has(trimmed)) {
      if (!duplicatesSeen.has(trimmed)) {
        duplicatesRemoved.push(trimmed);
        duplicatesSeen.add(trimmed);
      }
      continue;
    }

    seen.add(trimmed);
    codes.push(trimmed);
  }

  return { codes, duplicatesRemoved };
}

export interface StyleCodeMatchResult {
  // style_code -> the matching supplier_products row's id, for every
  // code that exact-matched.
  matched: Map<string, { supplierProductId: number; supplierId: number }>;
  // Every input code with no exact match at all, in input order --
  // reported to the admin so they can fix a typo or confirm the style
  // genuinely isn't in the catalog yet. Never guessed at or silently
  // dropped.
  unmatched: string[];
  // Codes that DID match, but are already on the approved list
  // (active or not) -- surfaced separately from "unmatched" so the
  // admin isn't told a real, already-approved style failed to match.
  alreadyApproved: string[];
}

// Pure matching step: given the parsed/deduped input codes, a map of
// every candidate supplier_products row keyed by its EXACT
// supplier_style (as already loaded by the caller -- this function
// itself makes no database call, so it is fully unit-testable with a
// synthetic map), and the set of supplier_product_ids already present
// on the approved list, computes the three buckets above. Matching is
// case-sensitive, exact-string equality only -- no fuzzy/trimmed-again/
// case-insensitive matching is performed here; the caller
// (lib/approvedCatalogStyleData.ts) is responsible for deciding whether
// to query supplier_products case-sensitively or not (it does, exactly
// -- see that module's own comment).
export function matchStyleCodes(
  codes: string[],
  candidatesByStyleCode: Map<string, { supplierProductId: number; supplierId: number }>,
  alreadyApprovedSupplierProductIds: Set<number>
): StyleCodeMatchResult {
  const matched = new Map<string, { supplierProductId: number; supplierId: number }>();
  const unmatched: string[] = [];
  const alreadyApproved: string[] = [];

  for (const code of codes) {
    const candidate = candidatesByStyleCode.get(code);
    if (!candidate) {
      unmatched.push(code);
      continue;
    }
    if (alreadyApprovedSupplierProductIds.has(candidate.supplierProductId)) {
      alreadyApproved.push(code);
      continue;
    }
    matched.set(code, candidate);
  }

  return { matched, unmatched, alreadyApproved };
}
