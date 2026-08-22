"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { OnlineStore } from "@/lib/onlineStoreTypes";

// Server-only read path for online_stores. This is the only place
// lib/supabase-admin.ts is imported for this feature, per the existing
// house rule that the service-role client is only ever imported inside a
// "use server" file. online_stores has RLS enabled with zero
// anon/authenticated policies (same as the Shopify PII tables) -- these
// functions are called directly from Server Components during render
// (not from a form/client handler), which is a fully supported way to
// invoke a Server Action and keeps the service-role key from ever
// reaching the browser: Next never includes a "use server" module's real
// function body (or anything it closes over) in the client bundle.
//
// This is the pattern to mirror for Phase 4B's protected-table reads
// (shopify_orders, shopify_order_line_items) -- one small "use server"
// data module per table/feature, called directly from Server Components.

export async function getOnlineStores(query?: string): Promise<OnlineStore[]> {
  let request = supabaseAdmin
    .from("online_stores")
    .select("id, name, slug, vendor_team_tag, active, fundraiser_rate, created_at, updated_at")
    .order("name", { ascending: true });

  if (query && query.trim()) {
    const escaped = query.trim().replace(/[%_,]/g, (match) => `\\${match}`);
    request = request.or(`name.ilike.%${escaped}%,vendor_team_tag.ilike.%${escaped}%`);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(`Failed to load online stores: ${error.message}`);
  }

  return data ?? [];
}

export async function getOnlineStoreById(id: number): Promise<OnlineStore | null> {
  if (!Number.isFinite(id)) return null;

  const { data, error } = await supabaseAdmin
    .from("online_stores")
    .select("id, name, slug, vendor_team_tag, active, fundraiser_rate, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load online store ${id}: ${error.message}`);
  }

  return data ?? null;
}
