import type { SalesLineItemDiscount } from "@/lib/onlineStoreSalesTypes";

// Pure decision logic behind the Sales Data page's Discount column --
// split out of components/SalesLineItemsTable.tsx (same reason as
// lib/shopifyLifecycleFlagsLogic.ts/lib/portalFeatureFlagLogic.ts: a
// plain .ts module with no JSX/"use client"/"use server" can be
// imported and exercised directly by a script, where a .tsx component
// cannot be as easily asserted against without a rendering framework
// this project doesn't otherwise depend on).
//
// Inputs (see SalesLineItemRow's own comment in onlineStoreSalesTypes.ts
// for the full contract):
//   - total: number | null | undefined -- null/undefined means the
//     amount itself is genuinely UNKNOWN, never treated as 0.
//   - codes: SalesLineItemDiscount[] | undefined -- undefined means the
//     code lookup failed/never ran (unknown); `[]` means it succeeded
//     and confirmed zero applications; a populated array means it
//     succeeded and found these applications.
export type DiscountDisplayState =
  | { kind: "codes"; codes: SalesLineItemDiscount[]; total: number | null }
  | { kind: "no-discount" }
  | { kind: "code-unavailable"; total: number }
  | { kind: "unavailable" };

// Four states, checked in this exact priority order:
//   1. "codes" -- code-level data exists (discountCodes non-empty) --
//      show each code/label, plus the amount if it's known.
//   2. "no-discount" -- the code lookup succeeded (discountCodes is a
//      real, possibly empty array -- not undefined) AND the amount is
//      confirmed exactly 0. The only combination allowed to resolve to
//      "no discount."
//   3. "code-unavailable" -- the amount is known and positive,
//      regardless of why codes are missing (lookup failed, or lookup
//      succeeded but found nothing). Deliberately does NOT require the
//      code lookup to have succeeded: a positive known amount with
//      missing codes must never be displayed as "no discount."
//   4. "unavailable" -- everything else (amount unknown, or amount is 0
//      but the code lookup itself failed so that 0 can't be fully
//      corroborated). Keeps an unsuccessful lookup from ever being
//      silently shown as a confirmed absence of a discount.
export function resolveDiscountDisplayState(row: {
  discountTotal?: number | null;
  discountCodes?: SalesLineItemDiscount[];
}): DiscountDisplayState {
  const codes = row.discountCodes;
  const total = row.discountTotal;

  if (codes && codes.length > 0) {
    return { kind: "codes", codes, total: total ?? null };
  }

  if (codes !== undefined && total === 0) {
    return { kind: "no-discount" };
  }

  if (total != null && total > 0) {
    return { kind: "code-unavailable", total };
  }

  return { kind: "unavailable" };
}
