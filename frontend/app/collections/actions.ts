"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CollectionFormState = {
  error: string | null;
};

export type CollectionActionState = {
  error: string | null;
};

function field(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCollection(
  _prevState: CollectionFormState,
  formData: FormData
): Promise<CollectionFormState> {
  const name = field(formData, "name");
  const description = field(formData, "description");
  const sport = field(formData, "sport");
  const season = field(formData, "season");
  const audience = field(formData, "audience");
  const heroImageUrl = field(formData, "hero_image_url");
  const active = formData.get("active") === "on" || formData.get("active") === "true";

  if (!name) {
    return { error: "Collection name is required." };
  }

  const slug = slugify(name);

  const { data, error } = await supabaseAdmin
    .from("collections")
    .insert({
      name,
      slug,
      description: description || null,
      sport: sport || null,
      season: season || null,
      audience: audience || null,
      hero_image_url: heroImageUrl || null,
      active,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "A collection with this name already exists." };
    }
    return { error: error?.message || "Failed to create collection. Please try again." };
  }

  revalidatePath("/collections");
  redirect(`/collections/${data.id}`);
}

export async function updateCollection(
  collectionId: number,
  _prevState: CollectionFormState,
  formData: FormData
): Promise<CollectionFormState> {
  const name = field(formData, "name");
  const description = field(formData, "description");
  const sport = field(formData, "sport");
  const season = field(formData, "season");
  const audience = field(formData, "audience");
  const heroImageUrl = field(formData, "hero_image_url");
  const active = formData.get("active") === "on" || formData.get("active") === "true";

  if (!name) {
    return { error: "Collection name is required." };
  }

  // Slug is derived once at creation and intentionally never rewritten here,
  // so links to this collection stay stable even if the name changes later.
  const { error } = await supabaseAdmin
    .from("collections")
    .update({
      name,
      description: description || null,
      sport: sport || null,
      season: season || null,
      audience: audience || null,
      hero_image_url: heroImageUrl || null,
      active,
    })
    .eq("id", collectionId);

  if (error) {
    if (error.code === "23505") {
      return { error: "A collection with this name already exists." };
    }
    return { error: "Failed to update collection. Please try again." };
  }

  revalidatePath("/collections");
  revalidatePath(`/collections/${collectionId}`);
  redirect(`/collections/${collectionId}`);
}

export async function deleteCollection(
  collectionId: number,
  _prevState: CollectionActionState,
  _formData: FormData
): Promise<CollectionActionState> {
  const { error } = await supabaseAdmin.from("collections").delete().eq("id", collectionId);

  if (error) {
    return { error: "Failed to delete collection. Please try again." };
  }

  revalidatePath("/collections");
  redirect("/collections");
}

async function nextSortOrder(collectionId: number): Promise<number> {
  const { count } = await supabaseAdmin
    .from("collection_products")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", collectionId);

  return count ?? 0;
}

export async function addProductToCollection(
  collectionId: number,
  _prevState: CollectionActionState,
  formData: FormData
): Promise<CollectionActionState> {
  const productId = Number(formData.get("catalog_product_id"));

  if (!Number.isFinite(productId)) {
    return { error: "Invalid product selection." };
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("catalog_settings")
    .select("workflow_status")
    .eq("catalog_product_id", productId)
    .maybeSingle();

  if (settingsError) {
    return { error: "Failed to verify product status. Please try again." };
  }

  const status = settings?.workflow_status || "Imported";

  if (status !== "Approved" && status !== "Website Ready") {
    return { error: "Only Approved or Website Ready products can be added to a collection." };
  }

  const sortOrder = await nextSortOrder(collectionId);

  const { error } = await supabaseAdmin.from("collection_products").insert({
    collection_id: collectionId,
    catalog_product_id: productId,
    sort_order: sortOrder,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "This product is already in the collection." };
    }
    return { error: "Failed to add product. Please try again." };
  }

  revalidatePath(`/collections/${collectionId}`);
  revalidatePath("/collections");

  return { error: null };
}

export type BulkAddResult = {
  error: string | null;
  addedCount: number;
  skippedCount: number;
};

export async function bulkAddProductsToCollection(
  collectionId: number,
  productIds: number[]
): Promise<BulkAddResult> {
  const fail = (error: string): BulkAddResult => ({ error, addedCount: 0, skippedCount: 0 });

  const { data: collection, error: collectionError } = await supabaseAdmin
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .maybeSingle();

  if (collectionError) {
    return fail("Failed to verify the collection. Please try again.");
  }

  if (!collection) {
    return fail("Collection not found.");
  }

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return fail("No products selected.");
  }

  const uniqueIds = Array.from(
    new Set(productIds.filter((id) => Number.isFinite(id)))
  );

  if (uniqueIds.length === 0) {
    return fail("No valid products selected.");
  }

  type ProductRow = {
    id: number;
    active: boolean;
    catalog_settings: { workflow_status: string } | { workflow_status: string }[] | null;
  };

  const { data: products, error: productsError } = await supabaseAdmin
    .from("catalog_products")
    .select("id, active, catalog_settings(workflow_status)")
    .in("id", uniqueIds);

  if (productsError) {
    return fail("Failed to verify selected products. Please try again.");
  }

  const foundIds = new Set(((products as ProductRow[]) ?? []).map((p) => p.id));
  const missingCount = uniqueIds.filter((id) => !foundIds.has(id)).length;

  const eligibleIds: number[] = [];
  let ineligibleCount = missingCount;

  for (const product of (products as ProductRow[]) ?? []) {
    const settings = Array.isArray(product.catalog_settings)
      ? product.catalog_settings[0]
      : product.catalog_settings;
    const status = settings?.workflow_status || "Imported";

    if (product.active && (status === "Approved" || status === "Website Ready")) {
      eligibleIds.push(product.id);
    } else {
      ineligibleCount += 1;
    }
  }

  if (eligibleIds.length === 0) {
    return fail(
      "None of the selected products are eligible. Only active, Approved or Website Ready products can be added."
    );
  }

  const { data: existingLinks, error: existingError } = await supabaseAdmin
    .from("collection_products")
    .select("catalog_product_id")
    .eq("collection_id", collectionId)
    .in("catalog_product_id", eligibleIds);

  if (existingError) {
    return fail("Failed to check existing collection membership. Please try again.");
  }

  const alreadyIn = new Set((existingLinks ?? []).map((link) => link.catalog_product_id));
  const toInsert = eligibleIds.filter((id) => !alreadyIn.has(id));
  const skippedCount = ineligibleCount + alreadyIn.size;

  if (toInsert.length === 0) {
    return {
      error:
        skippedCount === uniqueIds.length && alreadyIn.size === eligibleIds.length
          ? "All selected products are already in this collection."
          : "No eligible new products to add — the selected products are either already in this collection or not Approved/Website Ready.",
      addedCount: 0,
      skippedCount,
    };
  }

  const { data: maxSortRow } = await supabaseAdmin
    .from("collection_products")
    .select("sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSortOrder = (maxSortRow?.sort_order ?? -1) + 1;

  const rows = toInsert.map((id) => ({
    collection_id: collectionId,
    catalog_product_id: id,
    sort_order: nextSortOrder++,
  }));

  const { error: insertError } = await supabaseAdmin.from("collection_products").insert(rows);

  if (insertError) {
    return fail("Failed to add products to collection. Please try again.");
  }

  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/collections/${collectionId}/products/add`);
  revalidatePath("/collections");

  return { error: null, addedCount: toInsert.length, skippedCount };
}

export async function bulkRemoveProductsFromCollection(
  collectionId: number,
  linkIds: number[]
): Promise<CollectionActionState> {
  if (!Array.isArray(linkIds) || linkIds.length === 0) {
    return { error: "No products selected." };
  }

  const uniqueIds = Array.from(new Set(linkIds.filter((id) => Number.isFinite(id))));

  if (uniqueIds.length === 0) {
    return { error: "No valid products selected." };
  }

  const { data: links, error: fetchError } = await supabaseAdmin
    .from("collection_products")
    .select("id, collection_id")
    .in("id", uniqueIds);

  if (fetchError) {
    return { error: "Failed to verify selected products. Please try again." };
  }

  const validIds = (links ?? [])
    .filter((link) => link.collection_id === collectionId)
    .map((link) => link.id);

  if (validIds.length === 0) {
    return { error: "None of the selected products belong to this collection." };
  }

  const { error } = await supabaseAdmin
    .from("collection_products")
    .delete()
    .in("id", validIds);

  if (error) {
    return { error: "Failed to remove products. Please try again." };
  }

  revalidatePath(`/collections/${collectionId}`);
  revalidatePath(`/collections/${collectionId}/products/add`);
  revalidatePath("/collections");

  return { error: null };
}

export async function removeProductFromCollection(
  collectionId: number,
  linkId: number,
  _prevState: CollectionActionState,
  _formData: FormData
): Promise<CollectionActionState> {
  const { data: link, error: fetchError } = await supabaseAdmin
    .from("collection_products")
    .select("id, collection_id")
    .eq("id", linkId)
    .single();

  if (fetchError || !link || link.collection_id !== collectionId) {
    return { error: "Product link not found." };
  }

  const { error } = await supabaseAdmin
    .from("collection_products")
    .delete()
    .eq("id", linkId);

  if (error) {
    return { error: "Failed to remove product. Please try again." };
  }

  revalidatePath(`/collections/${collectionId}`);
  revalidatePath("/collections");

  return { error: null };
}
