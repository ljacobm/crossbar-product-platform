// Pure logic for Online Store creation/editing (Creator 3.0, Phase 1 --
// Store Provisioning). No DB access, no "use server" -- shared by
// app/(internal)/stores/new/actions.ts (createOnlineStore) and
// app/(internal)/stores/[storeId]/overview/edit/actions.ts
// (updateOnlineStore) so the two paths can never silently drift apart in
// what they accept. See docs/creator3-phase1-store-provisioning.md.

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Matches EXACTLY the normalization frontend/lib/shopifyParsing.ts's
// parseVendor() applies when extracting a team tag from a real Shopify
// order's Vendor field: trim, then collapse any run of internal
// whitespace to a single space. Case is deliberately NEVER folded --
// matchOnlineStores() in frontend/lib/shopifyNormalized.ts matches tags
// via plain case-sensitive SQL equality (`.in("vendor_team_tag", ...)`),
// so a staff-entered tag must preserve case exactly as typed or it will
// never match a real order.
export function normalizeVendorTeamTag(raw: string): string | null {
  const collapsed = raw.trim().split(/\s+/).filter(Boolean).join(" ");
  return collapsed === "" ? null : collapsed;
}

export type FundraiserRateResult =
  | { ok: true; rate: number }
  | { ok: false; error: string };

const FUNDRAISER_RATE_ERROR = "Fundraiser rate must be between 0% and 100%.";

// Accepts a percentage string ("0" through "100", inclusive; decimals
// allowed, e.g. "17.5") and returns the stored fraction (0.175). Empty
// input is not handled here -- callers default to "20" before calling
// this, matching the form's own pre-filled default.
export function validateFundraiserRatePercent(raw: string): FundraiserRateResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: FUNDRAISER_RATE_ERROR };
  }

  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) {
    return { ok: false, error: FUNDRAISER_RATE_ERROR };
  }

  if (percent < 0 || percent > 100) {
    return { ok: false, error: FUNDRAISER_RATE_ERROR };
  }

  return { ok: true, rate: percent / 100 };
}

// Light check only, per the design doc -- not full RFC 5322 validation.
export function isLikelyValidEmail(value: string): boolean {
  return value.includes("@");
}

export const STORE_NAME_REQUIRED_ERROR = "Store name is required.";
export const STORE_NAME_MAX_LENGTH = 200;
export const STORE_NAME_TOO_LONG_ERROR = `Store name must be ${STORE_NAME_MAX_LENGTH} characters or fewer.`;
export const CONTACT_EMAIL_INVALID_ERROR = "That doesn't look like a valid email address.";
export const SLUG_COLLISION_ERROR =
  "A store with this name already exists (or a very similar one) -- try adding a distinguishing detail, like a year or city.";
export const VENDOR_TAG_COLLISION_ERROR = "Another store is already using this vendor team tag.";
// Forward-compatibility fallback (see docs/creator3-phase1-store-provisioning.md
// §4): database/migrations/20261105_add_online_store_vendor_tag_aliases.sql
// is committed but NOT YET APPLIED to either database. Once applied, it
// adds a BEFORE INSERT OR UPDATE trigger on online_stores that rejects a
// tag already claimed as another store's alias via a plain `raise
// exception` (Postgres code 'P0001'), not a unique-violation ('23505').
// This message covers that case (and any other unrecognized error on this
// column) without this code needing to be revisited when that migration
// eventually lands.
export const VENDOR_TAG_GENERIC_ERROR =
  "This vendor tag can't be used -- it may already be claimed elsewhere.";

export interface StoreFormInput {
  name: string;
  vendorTeamTag: string;
  fundraiserRatePercent: string;
  organizationType: string;
  sport: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

export interface ValidatedStoreFields {
  name: string;
  vendorTeamTag: string | null;
  fundraiserRate: number;
  organizationType: string | null;
  sport: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
}

export type StoreFieldsResult =
  | { ok: true; fields: ValidatedStoreFields }
  | { ok: false; error: string };

// The single shared validation pass for both create and edit. Returning
// a discriminated union (rather than throwing) keeps both Server Actions'
// error-to-useActionState plumbing identical.
export function validateStoreFields(input: StoreFormInput): StoreFieldsResult {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: STORE_NAME_REQUIRED_ERROR };
  }
  if (name.length > STORE_NAME_MAX_LENGTH) {
    return { ok: false, error: STORE_NAME_TOO_LONG_ERROR };
  }

  const vendorTeamTag = normalizeVendorTeamTag(input.vendorTeamTag);

  const rateInput = input.fundraiserRatePercent.trim() === "" ? "20" : input.fundraiserRatePercent;
  const rateResult = validateFundraiserRatePercent(rateInput);
  if (!rateResult.ok) {
    return { ok: false, error: rateResult.error };
  }

  const contactEmail = trimOrNull(input.contactEmail);
  if (contactEmail && !isLikelyValidEmail(contactEmail)) {
    return { ok: false, error: CONTACT_EMAIL_INVALID_ERROR };
  }

  return {
    ok: true,
    fields: {
      name,
      vendorTeamTag,
      fundraiserRate: rateResult.rate,
      organizationType: trimOrNull(input.organizationType),
      sport: trimOrNull(input.sport),
      contactName: trimOrNull(input.contactName),
      contactEmail,
      contactPhone: trimOrNull(input.contactPhone),
      notes: trimOrNull(input.notes),
    },
  };
}
