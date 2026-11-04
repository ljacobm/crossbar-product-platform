// Pure extraction logic for the Sales Data table's "Last Name" column --
// split out of lib/salesCalculations.ts for the same reason as
// lib/discountDisplayState.ts: a plain .ts module with no "server-only"
// guard can be imported and exercised directly by a test script.
//
// PRIVACY: this function's INPUT carries full shipping/billing address
// objects (server-side only, read inside salesCalculations.ts) -- its
// OUTPUT is a single derived string or null. Callers must never forward
// the input objects themselves anywhere a client could see them; only
// this function's return value is attached to a SalesLineItemRow. See
// scripts/verifyPortalPrivacy.ts for the automated checks that the full
// address objects never reach SalesLineItemRow/CustomerLineItem.
//
// Priority order, per the approved spec: the order's shipping recipient
// last name first (who actually received the order); if shipping
// information is missing, fall back to the billing address's last name,
// then to the Shopify customer record's own last name. Returns null (not
// "") when none of the three sources has a usable value, so the display
// layer can render a clear "-" rather than an empty cell.
export function resolveOrderLastName(order: {
  shipping_address?: { last_name?: string | null } | null;
  billing_address?: { last_name?: string | null } | null;
  customer?: { last_name?: string | null } | null;
}): string | null {
  const candidates = [
    order.shipping_address?.last_name,
    order.billing_address?.last_name,
    order.customer?.last_name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}
