"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";

// Server-only read path for collections and collection_products -- Phase
// B, slice 2 of the post-Stage-1 RLS follow-up (see docs/roadmap.md /
// docs/decisions.md). Mirrors lib/onlineStoreData.ts /
// lib/knowledgeResourceData.ts: one small "use server" data module per
// table/feature, every exported function calling requireStaffSession()
// first, reads go through supabaseAdmin so they keep working the moment
// RLS is enabled on these two tables (not yet enabled -- see the Phase B
// migration notes). Mutations already went through supabaseAdmin before
// this change (see app/(internal)/collections/actions.ts) -- this module
// only replaces the read side.

export type CollectionListRawRow = {
  id: number;
  name: string;
  sport: string | null;
  season: string | null;
  active: boolean;
  products: { count: number }[] | null;
};

// Backs the Collections list page: the filtered/searched list with each
// row's linked-product count.
export async function getCollectionList(
  q?: string
): Promise<{ collections: CollectionListRawRow[]; count: number }> {
  await requireStaffSession();

  let query = supabaseAdmin
    .from("collections")
    .select(
      `
      id,
      name,
      sport,
      season,
      active,
      products:collection_products(count)
      `,
      { count: "exact" }
    )
    .order("name", { ascending: true });

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `name.ilike.%${escaped}%,sport.ilike.%${escaped}%,season.ilike.%${escaped}%,audience.ilike.%${escaped}%`
    );
  }

  const { data, count } = await query;

  return {
    collections: (data as unknown as CollectionListRawRow[]) ?? [],
    count: count ?? 0,
  };
}

export type CollectionDetail = {
  id: number;
  name: string;
  description: string | null;
  sport: string | null;
  season: string | null;
  audience: string | null;
  hero_image_url: string | null;
  active: boolean;
};

// Shared by the Collection Workspace page and the Edit Collection page --
// both queries were already byte-for-byte identical before this change.
export async function getCollectionById(id: string | number): Promise<CollectionDetail | null> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("id, name, description, sport, season, audience, hero_image_url, active")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as CollectionDetail;
}

// Backs the "Add Products to Collection" page header -- a narrower lookup
// than getCollectionById, preserved as its own shape rather than widened.
export async function getCollectionName(
  id: string | number
): Promise<{ id: number; name: string } | null> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("id, name")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data;
}

export type CollectionProductLinkRaw = {
  id: number;
  catalog_product_id: number;
  sort_order: number | null;
  product: {
    id: number;
    display_name: string;
    crossbar_sku: string;
    brand_display: string | null;
    crossbar_category: string | null;
    source_type: string;
    age_group: string | null;
    active: boolean;
    product_images: {
      id: number;
      image_url: string;
      image_type?: string;
      active?: boolean;
      sort_order: number | null;
    }[];
    catalog_settings:
      | { workflow_status: string; website_ready: boolean; team_store_enabled: boolean }
      | { workflow_status: string; website_ready: boolean; team_store_enabled: boolean }[]
      | null;
    supplier_products: { supplier_status: string } | { supplier_status: string }[] | null;
  } | null;
};

// Backs the Collection Workspace page's product list. catalog_products /
// product_images / catalog_settings / supplier_products columns ride
// along as a nested embed of this collection_products query -- they
// aren't a separate top-level read, and those tables' own RLS posture
// (none yet) is unchanged either way.
export async function getCollectionProductsForWorkspace(
  collectionId: string | number
): Promise<CollectionProductLinkRaw[]> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("collection_products")
    .select(
      `
      id,
      catalog_product_id,
      sort_order,
      product:catalog_products (
        id,
        display_name,
        crossbar_sku,
        brand_display,
        crossbar_category,
        source_type,
        age_group,
        active,
        product_images (
          id,
          image_url,
          image_type,
          active,
          sort_order
        ),
        catalog_settings (
          workflow_status,
          website_ready,
          team_store_enabled
        ),
        supplier_products (
          supplier_status
        )
      )
      `
    )
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true });

  return (data as unknown as CollectionProductLinkRaw[]) ?? [];
}

// Backs the "exclude already-in-collection products" lookup on the Add
// Products to Collection page.
export async function getExistingCollectionProductIds(
  collectionId: string | number
): Promise<number[]> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("collection_products")
    .select("catalog_product_id")
    .eq("collection_id", collectionId);

  return (data || []).map((row) => row.catalog_product_id as number);
}
