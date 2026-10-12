"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import { generateRawPortalToken, hashPortalToken } from "@/lib/portalTokens";
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

  const { error } = await supabaseAdmin.rpc("rotate_online_store_portal_token", {
    p_online_store_id: storeId,
    p_token_hash: tokenHash,
    p_expires_at: null,
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

  const { error } = await supabaseAdmin
    .from("online_store_portal_tokens")
    .update({ active: false })
    .eq("online_store_id", storeId)
    .eq("active", true);

  if (error) {
    return { error: "Failed to revoke portal link. Please try again." };
  }

  revalidatePath(`/stores/${storeId}/overview`);
  return { error: null };
}
