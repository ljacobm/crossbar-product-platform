"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";

// Server-only read path for online_store_portal_tokens -- Phase 4D,
// Slice 1 (Customer Fundraising Portal). Mirrors lib/onlineStoreData.ts:
// a "use server" data module, requireStaffSession() first, reads go
// through supabaseAdmin. online_store_portal_tokens has RLS enabled with
// zero anon/authenticated policies, and anon/authenticated hold no
// table-level privileges at all on it (see the Slice 1 migration) -- the
// only path to this table is this module and
// app/(internal)/stores/[storeId]/actions.ts, both service_role.
//
// This function returns status metadata only -- token_hash is never
// selected, so there is no path through this module that could ever
// return a token hash (raw or hashed) to a caller, by construction, not
// by after-the-fact filtering.

export type PortalLinkStatus = {
  enabled: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
};

const EMPTY_STATUS: PortalLinkStatus = {
  enabled: false,
  createdAt: null,
  expiresAt: null,
  lastAccessedAt: null,
  accessCount: 0,
};

export async function getPortalLinkStatus(storeId: number): Promise<PortalLinkStatus> {
  await requireStaffSession();

  // Same positive-safe-integer check as the write actions in
  // app/(internal)/stores/[storeId]/actions.ts -- an invalid id simply
  // reads as "no active link" rather than reaching the database with a
  // value that was never validated as a real store id.
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    return EMPTY_STATUS;
  }

  const { data, error } = await supabaseAdmin
    .from("online_store_portal_tokens")
    .select("created_at, expires_at, last_accessed_at, access_count")
    .eq("online_store_id", storeId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load portal link status for store ${storeId}: ${error.message}`);
  }

  if (!data) {
    return EMPTY_STATUS;
  }

  return {
    enabled: true,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    lastAccessedAt: data.last_accessed_at,
    accessCount: data.access_count,
  };
}
