"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import { validateVendorTagAlias } from "@/lib/vendorTagValidation";

// Staff-only CRUD surface for the Shopify Vendor Tags settings section
// (Online Store Overview page) -- the many-to-one alias mapping added
// alongside online_stores.vendor_team_tag by database/migrations/
// 20261105_add_online_store_vendor_tag_aliases.sql. Same authorization
// model as app/(internal)/stores/[storeId]/actions.ts: requireStaffSession()
// first in every exported function; there is no separate per-store staff
// permission tier anywhere in this app.
//
// Removing an alias here only affects FUTURE Shopify ingestion (it stops
// a tag from matching going forward) -- it never touches, and never
// should touch, shopify_order_line_items.online_store_id for rows
// already associated with a store. See vendorTagAliasesTest's "removing
// an alias never remaps already-associated line items" test and
// scripts/verifyVendorTagAliases.ts's structural check that this file
// never writes to shopify_order_line_items at all.

export type VendorTagAlias = {
  id: number;
  tag: string;
  createdAt: string;
  createdBy: string | null;
};

export type VendorTagAliasActionState = {
  error: string | null;
};

function isValidStoreId(storeId: number): boolean {
  return Number.isSafeInteger(storeId) && storeId > 0;
}

export async function getVendorTagAliases(storeId: number): Promise<VendorTagAlias[]> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("online_store_vendor_tag_aliases")
    .select("id, tag, created_at, created_by")
    .eq("online_store_id", storeId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load vendor tag aliases: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    tag: row.tag,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

export async function addVendorTagAlias(
  storeId: number,
  rawTag: string
): Promise<VendorTagAliasActionState> {
  const session = await requireStaffSession();

  if (!isValidStoreId(storeId)) {
    return { error: "Invalid store." };
  }

  const { data: store, error: storeError } = await supabaseAdmin
    .from("online_stores")
    .select("id, vendor_team_tag")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) {
    return { error: "Failed to look up store. Please try again." };
  }
  if (!store) {
    return { error: "Store not found." };
  }

  const validation = validateVendorTagAlias(rawTag, { primaryTag: store.vendor_team_tag });
  if (!validation.valid) {
    return { error: validation.error };
  }

  const { error } = await supabaseAdmin.from("online_store_vendor_tag_aliases").insert({
    online_store_id: storeId,
    tag: validation.tag,
    created_by: session.email,
  });

  if (error) {
    // Covers the alias table's own unique(tag) violation (another store
    // already claims this exact alias, or this store already has it)
    // AND the cross-table trigger raising when the tag matches some
    // store's primary vendor_team_tag -- the database is the
    // authoritative enforcement for both (see the migration's global
    // uniqueness invariant comment); this is only ever a friendlier
    // message than the raw constraint-violation/trigger-exception text.
    return {
      error: "This tag is already associated with a store (as a primary tag or another alias).",
    };
  }

  revalidatePath(`/stores/${storeId}/overview`);
  return { error: null };
}

export async function removeVendorTagAlias(
  storeId: number,
  aliasId: number
): Promise<VendorTagAliasActionState> {
  await requireStaffSession();

  if (!isValidStoreId(storeId)) {
    return { error: "Invalid store." };
  }

  const { error } = await supabaseAdmin
    .from("online_store_vendor_tag_aliases")
    .delete()
    .eq("id", aliasId)
    .eq("online_store_id", storeId);

  if (error) {
    return { error: "Failed to remove alias. Please try again." };
  }

  revalidatePath(`/stores/${storeId}/overview`);
  return { error: null };
}
