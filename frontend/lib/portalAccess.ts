import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashPortalToken, isValidRawPortalTokenFormat } from "@/lib/portalTokens";

// Phase 4D, Slice 3: server-only portal token resolution. Deliberately
// NOT a "use server" file -- a "use server" file's every real export
// becomes a publicly-callable Server Action RPC endpoint, and a token
// resolver must never be independently invocable that way (an attacker
// could otherwise probe arbitrary token guesses directly against this
// endpoint, outside the normal page-render flow, regardless of how
// unlikely a guess is to succeed). `server-only` still guards this
// module from ever being imported into client-bundled code. The only
// legitimate caller is app/portal/[token]/page.tsx (a Server Component)
// and lib/customerPortalSalesData.ts, both server-side.
//
// Every failure mode -- malformed token, nonexistent hash, inactive,
// expired, or a database error -- returns the same `null`. The caller
// (the portal page) renders one generic "this link isn't available"
// message regardless of which case it was, matching the non-disclosure
// principle already used for staff login (requestLoginCode/
// verifyLoginCode) and the auth callback route.

// Phase 4D, Slice 4A (correction): exported so the caller can track
// access only once it has fully authorized the request -- token
// validity AND pilot eligibility -- rather than this module tracking
// unconditionally as part of resolution. See recordPortalAccess's own
// comment and resolvePortalStoreId's return type below for why.
export async function recordPortalAccess(tokenRowId: number): Promise<void> {
  // Best-effort, non-critical: a failure here -- whether a thrown
  // exception (e.g. a network error) or Supabase's own returned `error`
  // property (e.g. a database-side rejection, which .rpc() does not
  // throw for) -- must never propagate out of this function or affect
  // the caller's response. This is purely an analytics counter with no
  // security or authorization implication; a dashboard that fails to
  // load because a tracking write failed would be strictly worse than
  // one that loads with a slightly stale access count.
  //
  // Atomic via increment_portal_token_access(), a Postgres function
  // (database/migrations/20261012_add_increment_portal_token_access.sql,
  // NOT YET APPLIED) that performs the read-modify-write as a single
  // UPDATE statement -- no separate select-then-write race from
  // application code.
  try {
    const { error } = await supabaseAdmin.rpc("increment_portal_token_access", {
      p_token_id: tokenRowId,
    });

    if (error) {
      // No internal error detail is ever surfaced to the customer --
      // this function's return type is void either way, so there is
      // nothing here for a caller to leak even if it wanted to.
      return;
    }
  } catch {
    // Swallowed intentionally -- see comment above.
  }
}

// Resolves a raw portal token to the online_store_id it grants access
// to and the token row's own id, or null if the token is malformed,
// unknown, inactive, expired, or a database error occurred (fails
// closed). Never logs or returns the raw token or its hash -- the only
// things that ever leave this function are two plain integer ids, or
// null.
//
// Phase 4D, Slice 4A (correction): this function deliberately does NOT
// call recordPortalAccess itself anymore. It previously tracked access
// unconditionally as soon as a token resolved as active/unexpired --
// before the caller (getCustomerPortalData) had a chance to check
// isStoreAllowedForPilot(storeId). That meant a valid, unexpired token
// for a store outside the pilot still counted as a successful portal
// visit (incrementing access_count / updating last_accessed_at) even
// though the request was ultimately rejected and no sales or payout
// data was ever served. Returning tokenId here lets the caller record
// access only after every authorization check has passed.
export async function resolvePortalStoreId(
  rawToken: string
): Promise<{ storeId: number; tokenId: number } | null> {
  if (!isValidRawPortalTokenFormat(rawToken)) {
    return null;
  }

  const tokenHash = hashPortalToken(rawToken);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("online_store_portal_tokens")
    .select("id, online_store_id")
    .eq("token_hash", tokenHash)
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return { storeId: data.online_store_id, tokenId: data.id };
}
