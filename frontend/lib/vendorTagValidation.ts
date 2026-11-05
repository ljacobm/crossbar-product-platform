// Pure validation for a new Shopify vendor tag alias, extracted so it is
// directly unit-testable without a database connection (same pattern as
// lib/discountDisplayState.ts, lib/orderLastName.ts, etc). The database
// migration's two triggers (database/migrations/
// 20261105_add_online_store_vendor_tag_aliases.sql) remain the
// authoritative enforcement for the actual conflict rules (global
// uniqueness across primary tags and aliases) -- this function only
// catches the cheap, obviously-invalid cases early, so
// lib/onlineStoreVendorTagAliases.ts's addVendorTagAlias() can return a
// clear, friendly error before ever reaching the database for those
// cases. A violation this function doesn't catch (e.g. a genuine
// cross-store conflict) still gets rejected -- by the trigger, inside
// the insert -- just with a less specific message.

export const VENDOR_TAG_MAX_LENGTH = 200;

export function normalizeVendorTag(input: string): string {
  return input.trim();
}

export type VendorTagAliasValidationResult =
  | { valid: true; tag: string }
  | { valid: false; error: string };

export function validateVendorTagAlias(
  input: string,
  context: { primaryTag: string | null }
): VendorTagAliasValidationResult {
  const tag = normalizeVendorTag(input);

  if (!tag) {
    return { valid: false, error: "Tag cannot be empty." };
  }

  if (tag.length > VENDOR_TAG_MAX_LENGTH) {
    return { valid: false, error: `Tag must be ${VENDOR_TAG_MAX_LENGTH} characters or fewer.` };
  }

  if (context.primaryTag && tag === context.primaryTag) {
    return { valid: false, error: "This is already the store's primary vendor tag." };
  }

  return { valid: true, tag };
}
