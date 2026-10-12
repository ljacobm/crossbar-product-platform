"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import {
  generateRawPortalToken,
  hashPortalToken,
  loadPortalEncryptionKey,
  encryptPortalToken,
  decryptPortalToken,
} from "@/lib/portalTokens";
import { isPortalGenerationEnabled, isStoreAllowedForPilot } from "@/lib/portalFeatureFlag";

// Phase 4D, Slice 1/2: Customer Fundraising Portal -- staff-only token
// management. No public portal route or token resolver exists yet; these
// three functions are the complete surface for creating, rotating, and
// revoking a store's portal link.
//
// generatePortalLink/regeneratePortalLink are gated by
// isPortalGenerationEnabled() (lib/portalFeatureFlag.ts), checked right
// after requireStaffSession() and before any store lookup or token
// write. This is the actual enforcement -- the Overview page UI also
// disables its Generate/Regenerate buttons when the flag is off, purely
// for a better staff experience, but that client-side disable is not
// what prevents generation: a disabled button doesn't stop the
// underlying Server Action from being called directly, so the real gate
// has to live here. revokePortalLink is never gated by this flag --
// revoking carries no risk tied to the portal's deployment state.
//
// generatePortalLink and regeneratePortalLink are both implemented on
// top of the same atomic rotate_online_store_portal_token() database
// function (see the Slice 1 migration), not as two separate
// "check-then-insert" code paths. A naive generatePortalLink that first
// SELECTs for an existing active token and then INSERTs only if none is
// found has a TOCTOU race under concurrent requests -- two simultaneous
// "Generate" clicks could both see no active token and both attempt an
// insert, relying on the partial unique index to reject the loser with a
// raw constraint-violation error instead of a clean one. Routing both
// operations through the same atomic revoke-then-insert RPC avoids that
// entirely: the UPDATE is a harmless no-op when there's nothing to
// revoke, and exactly one active token always exists afterward, in both
// the empty-store and already-has-a-token cases.

export type PortalLinkActionState = {
  error: string | null;
  url?: string;
};

function buildPortalUrl(rawToken: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return siteUrl ? `${siteUrl}/portal/${rawToken}` : `/portal/${rawToken}`;
}

function isValidStoreId(storeId: number): boolean {
  return Number.isSafeInteger(storeId) && storeId > 0;
}

async function rotateToken(storeId: number): Promise<PortalLinkActionState> {
  if (!isValidStoreId(storeId)) {
    return { error: "Invalid store." };
  }

  // Slice 4A pilot restriction, checked before the store-existence
  // lookup: narrower than isPortalGenerationEnabled() alone, requiring
  // an exact match against PORTAL_PILOT_STORE_ID in addition to the
  // global flag. isStoreAllowedForPilot() already incorporates the
  // global flag check too -- this one call is the complete gate.
  if (!isStoreAllowedForPilot(storeId)) {
    return { error: "This store is not part of the current customer portal pilot." };
  }

  const { data: store } = await supabaseAdmin
    .from("online_stores")
    .select("id")
    .eq("id", storeId)
    .single();

  if (!store) {
    return { error: "Store not found." };
  }

  const rawToken = generateRawPortalToken();
  const tokenHash = hashPortalToken(rawToken);

  // Phase 4D, Slice 4B (correction): a valid PORTAL_TOKEN_ENCRYPTION_KEY
  // is now REQUIRED to create or rotate a link -- encryption is checked,
  // and must succeed, before rotate_online_store_portal_token is called
  // at all. This is deliberately placed before the RPC call (which is
  // what atomically deactivates the old token and inserts the new one):
  // failing here means neither side effect has happened yet, so a
  // missing/invalid key or an encryption failure can never deactivate an
  // existing working link, and can never create a new token that would
  // be permanently unrecoverable (no encrypted copy, no way to add one
  // later without rotating again). The error returned to staff is
  // generic -- it never distinguishes "key unset" from "key malformed"
  // from "encryption threw" -- those are all operational/configuration
  // detail, not something to surface outside logs.
  //
  // This does NOT affect existing customer token validation:
  // resolvePortalStoreId() (lib/portalAccess.ts) authenticates purely by
  // token_hash and never reads or depends on
  // PORTAL_TOKEN_ENCRYPTION_KEY -- a previously issued link keeps working
  // for customers regardless of this key's state.
  let encryptedToken: string;
  try {
    const key = loadPortalEncryptionKey(process.env);
    encryptedToken = encryptPortalToken(rawToken, key);
  } catch {
    return { error: "Portal link generation is not available right now. Please try again later." };
  }

  const { error } = await supabaseAdmin.rpc("rotate_online_store_portal_token", {
    p_online_store_id: storeId,
    p_token_hash: tokenHash,
    p_expires_at: null,
    p_encrypted_token: encryptedToken,
  });

  if (error) {
    return { error: "Failed to generate portal link. Please try again." };
  }

  revalidatePath(`/stores/${storeId}/overview`);
  return { error: null, url: buildPortalUrl(rawToken) };
}

// Creates this store's first portal link, or replaces an existing one --
// see the module-level comment for why this shares rotateToken() with
// regeneratePortalLink() rather than rejecting when one already exists.
export async function generatePortalLink(storeId: number): Promise<PortalLinkActionState> {
  await requireStaffSession();

  if (!isPortalGenerationEnabled()) {
    return { error: "Portal link generation is not yet available." };
  }

  return rotateToken(storeId);
}

// Atomically revokes the current active token (if any) and issues a
// replacement in the same database transaction -- the old link stops
// working and the new one starts working as a single, indivisible
// change; there is no window where both or neither are valid.
export async function regeneratePortalLink(storeId: number): Promise<PortalLinkActionState> {
  await requireStaffSession();

  if (!isPortalGenerationEnabled()) {
    return { error: "Portal link generation is not yet available." };
  }

  return rotateToken(storeId);
}

// Marks the current active token inactive. Future portal access becomes
// invalid the moment this update commits -- the (not-yet-built, Slice 2)
// portal resolver will always look up active = true directly against the
// database, with no caching layer in between, so there is no additional
// propagation step needed here.
export async function revokePortalLink(storeId: number): Promise<PortalLinkActionState> {
  await requireStaffSession();

  if (!isValidStoreId(storeId)) {
    return { error: "Invalid store." };
  }

  const { data: store } = await supabaseAdmin
    .from("online_stores")
    .select("id")
    .eq("id", storeId)
    .single();

  if (!store) {
    return { error: "Store not found." };
  }

  // Phase 4D, Slice 4B: clearing encrypted_token in the same update as
  // active = false means a disabled link's persistent, staff-retrievable
  // copy is gone the instant it's disabled -- not just unusable by a
  // customer (which active = false alone already guaranteed).
  const { error } = await supabaseAdmin
    .from("online_store_portal_tokens")
    .update({ active: false, encrypted_token: null })
    .eq("online_store_id", storeId)
    .eq("active", true);

  if (error) {
    return { error: "Failed to revoke portal link. Please try again." };
  }

  revalidatePath(`/stores/${storeId}/overview`);
  return { error: null };
}

// Phase 4D, Slice 4B: staff-only retrieval of the current active link's
// full URL, for the "Copy Active Link" control -- an explicit,
// on-demand Server Action, never embedded in the Overview page's
// initial server-rendered props. requireStaffSession() runs first, same
// as every other action in this file; there is no separate per-store
// staff permission model anywhere in this app (see lib/auth.ts --
// requireStaffSession() checks staff_allowlist membership only), so
// store authorization here is the same isValidStoreId()
// store-existence check used throughout, not a new, narrower check.
//
// Phase 4D, Slice 4B (correction): also gated by isStoreAllowedForPilot()
// -- while the pilot restriction is active, a non-pilot store's staff
// must not be able to retrieve its encrypted link either, even though
// the link already exists and was already created under that same
// gate. This mirrors the Slice 4A requirement that the customer-facing
// data path re-checks pilot eligibility on every request rather than
// "grandfathering" a link that was valid before the restriction existed
// or changed -- staff retrieval gets the identical treatment, using the
// exact same predicate (isStoreAllowedForPilot already incorporates the
// global isPortalGenerationEnabled() check too), so the two surfaces
// can never drift apart.
export async function getActivePortalLink(
  storeId: number
): Promise<{ url: string | null; error: string | null }> {
  await requireStaffSession();

  if (!isValidStoreId(storeId)) {
    return { url: null, error: "Invalid store." };
  }

  if (!isStoreAllowedForPilot(storeId)) {
    return { url: null, error: "This store is not part of the current customer portal pilot." };
  }

  const nowIso = new Date().toISOString();

  // Same active/expiry filter as portalAccess.ts's resolvePortalStoreId
  // -- an inactive or expired row must never be presented as retrievable
  // here either.
  const { data, error } = await supabaseAdmin
    .from("online_store_portal_tokens")
    .select("encrypted_token")
    .eq("online_store_id", storeId)
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .maybeSingle();

  if (error) {
    return { url: null, error: "Failed to retrieve link. Please try again." };
  }

  if (!data || !data.encrypted_token) {
    return {
      url: null,
      error:
        "This link isn't available for retrieval -- regenerate it to enable copying it again.",
    };
  }

  try {
    const key = loadPortalEncryptionKey(process.env);
    const rawToken = decryptPortalToken(data.encrypted_token, key);
    return { url: buildPortalUrl(rawToken), error: null };
  } catch {
    // Never surfaces why -- wrong/missing key, corrupted value, or a
    // failed auth-tag check all look the same to the caller: retrieval
    // simply isn't available right now.
    return { url: null, error: "Failed to retrieve link. Please try again." };
  }
}
