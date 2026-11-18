"use server";

import { requireStaffSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  generateRawCatalogAccessToken,
  hashCatalogAccessToken,
} from "@/lib/onlineStoreCatalogAccessTokenCrypto";

// Staff Server Actions for generating/revoking a store's customer
// catalog access link -- mirrors the shape of
// app/(internal)/stores/[storeId]/actions.ts's own
// generatePortalLink/regeneratePortalLink/revokePortalLink, applied to
// the separate online_store_catalog_access_tokens table (see that
// migration's own comment for why this is a distinct table rather than
// a shared one). Deliberately simpler than the portal link actions: no
// encrypted-retrievable-copy feature (out of scope for this phase) and
// no feature flag -- catalog link generation is available for every
// store from the start.

export type CatalogLinkActionState = { error: string | null; url?: string };

// A customer catalog link is always copied or sent OUTSIDE this app
// (text message, email) -- it is never just clicked from within a page
// this app rendered. A bare relative path like "/store/<token>" only
// resolves correctly when there's an existing page to resolve it
// against; pasted anywhere else (an address bar, a text message), it
// has no base to resolve against and a browser can misinterpret the
// first path segment as a hostname to look up (DNS_PROBE_FINISHED_NXDOMAIN).
// So this throws rather than silently falling back to a relative path
// -- "do not silently generate localhost links for customers,"
// extended to: do not silently generate ANY non-absolute link for a
// customer. Checked BEFORE the token is ever rotated (see
// rotateToken() below), so a misconfigured environment can never
// revoke a store's working link while failing to hand back a usable
// replacement.
function getConfiguredSiteUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    throw new Error(
      "The application's base URL (NEXT_PUBLIC_SITE_URL) is not configured, so a working customer link can't be generated. Set it in .env.local (e.g. http://localhost:3000) for local development, or in this deployment's environment variables for production, then try again."
    );
  }
  // Defensive: guarantees exactly one slash between the origin and
  // "store/<token>" regardless of whether the configured value has a
  // trailing slash.
  return siteUrl.replace(/\/+$/, "");
}

function buildCatalogUrl(rawToken: string, siteUrl: string): string {
  // "/store/<token>", not "/catalog/<token>" -- app/(internal)/catalog/
  // already occupies the /catalog URL prefix (the staff Catalog
  // Manager redirect + /catalog/approved-styles); see
  // app/store/[token]/page.tsx's own comment for the full reasoning.
  return `${siteUrl}/store/${rawToken}`;
}

function isValidStoreId(storeId: number): boolean {
  return Number.isSafeInteger(storeId) && storeId > 0;
}

async function rotateToken(storeId: number): Promise<CatalogLinkActionState> {
  if (!isValidStoreId(storeId)) {
    return { error: "Invalid store." };
  }

  let siteUrl: string;
  try {
    siteUrl = getConfiguredSiteUrl();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to build the catalog link." };
  }

  const { data: store } = await supabaseAdmin.from("online_stores").select("id").eq("id", storeId).maybeSingle();
  if (!store) {
    return { error: "Store not found." };
  }

  const rawToken = generateRawCatalogAccessToken();
  const tokenHash = hashCatalogAccessToken(rawToken);

  const { error } = await supabaseAdmin.rpc("rotate_online_store_catalog_access_token", {
    p_online_store_id: storeId,
    p_token_hash: tokenHash,
    p_expires_at: null,
  });

  if (error) {
    return { error: "Failed to generate catalog link. Please try again." };
  }

  return { error: null, url: buildCatalogUrl(rawToken, siteUrl) };
}

export async function generateCatalogAccessLink(storeId: number): Promise<CatalogLinkActionState> {
  await requireStaffSession();
  return rotateToken(storeId);
}

export async function regenerateCatalogAccessLink(storeId: number): Promise<CatalogLinkActionState> {
  await requireStaffSession();
  return rotateToken(storeId);
}

export async function revokeCatalogAccessLink(storeId: number): Promise<CatalogLinkActionState> {
  await requireStaffSession();
  if (!isValidStoreId(storeId)) {
    return { error: "Invalid store." };
  }

  const { error } = await supabaseAdmin
    .from("online_store_catalog_access_tokens")
    .update({ active: false })
    .eq("online_store_id", storeId)
    .eq("active", true);

  if (error) {
    return { error: "Failed to revoke catalog link. Please try again." };
  }

  return { error: null };
}

export type CatalogLinkStatus = {
  enabled: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
};

export async function getCatalogAccessLinkStatus(storeId: number): Promise<CatalogLinkStatus> {
  await requireStaffSession();
  const empty: CatalogLinkStatus = { enabled: false, createdAt: null, expiresAt: null, lastAccessedAt: null, accessCount: 0 };
  if (!isValidStoreId(storeId)) return empty;

  const { data, error } = await supabaseAdmin
    .from("online_store_catalog_access_tokens")
    .select("created_at, expires_at, last_accessed_at, access_count")
    .eq("online_store_id", storeId)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return empty;

  return {
    enabled: true,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    lastAccessedAt: data.last_accessed_at,
    accessCount: data.access_count,
  };
}
