// TEMPORARY, display-only exception. LVC Coaches is not currently run as
// a fundraiser, so the Sales Data dashboard's fundraiser-specific summary
// cards (Fundraiser Earned, Lifetime Paid Out, Lifetime Balance Due)
// would be misleading for this store's owner to see. This is a stopgap,
// store-identity-based override -- it does NOT touch the store's own
// fundraiser rate, any payout record, or any sales/discount calculation;
// it only hides three cards in the UI for this one store.
//
// This should be deleted once the Team Store Creator/Updater gains a
// real, configurable "is this store a fundraiser?" setting -- at that
// point every caller of isFundraisingHiddenForStore() should read that
// setting directly instead.
//
// Identified by slug (a stable, unique identifier -- see online_stores'
// own unique constraint), never by a loose match on the store's display
// name, which can change.
const STORE_SLUGS_WITHOUT_FUNDRAISING = new Set(["lvc-coaches"]);

export function isFundraisingHiddenForStore(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return STORE_SLUGS_WITHOUT_FUNDRAISING.has(slug.trim().toLowerCase());
}
