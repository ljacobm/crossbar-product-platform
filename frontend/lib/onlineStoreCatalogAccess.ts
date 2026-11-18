import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  hashCatalogAccessToken,
  isValidRawCatalogAccessTokenFormat,
} from "@/lib/onlineStoreCatalogAccessTokenCrypto";

// Server-only catalog access token resolution -- mirrors
// lib/portalAccess.ts exactly (see that file's own extensive comment
// for the full rationale, restated briefly here). Deliberately NOT a
// "use server" file: a "use server" file's every real export becomes a
// publicly callable Server Action RPC endpoint, and a token resolver
// must never be independently invocable that way. The only legitimate
// callers are app/catalog/[token]/layout.tsx (a Server Component) and
// lib/onlineStoreCatalogCustomerData.ts, both server-side.
//
// Every failure mode -- malformed token, unknown hash, inactive,
// expired, or a database error -- returns the same `null`. The
// caller renders one generic "this link isn't available" message
// regardless of which case it was, matching the non-disclosure
// principle already used for the fundraiser portal and staff login.
//
// Task requirement 4: "Never rely solely on an unverified store
// identifier in the URL." This is the enforcement point -- the
// customer catalog route's URL carries ONLY an opaque token, never a
// store id; every request resolves the store id from THIS function,
// against the database, every time. There is no code path anywhere in
// the customer catalog feature that reads a store id directly from a
// URL param or client-supplied value and trusts it.

export async function resolveCatalogAccessStoreId(
  rawToken: string
): Promise<{ storeId: number; tokenId: number } | null> {
  if (!isValidRawCatalogAccessTokenFormat(rawToken)) {
    return null;
  }

  const tokenHash = hashCatalogAccessToken(rawToken);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("online_store_catalog_access_tokens")
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

// Best-effort access-stat bump, same non-blocking contract as
// lib/portalAccess.ts's recordPortalAccess() -- a failure here must
// never propagate to the caller or affect the response.
export async function recordCatalogAccess(tokenId: number): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc("increment_online_store_catalog_access_token", {
      p_token_id: tokenId,
    });
    if (error) return;
  } catch {
    // Swallowed intentionally -- see comment above.
  }
}
