"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ResourceActionState = {
  error: string | null;
};

function field(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

async function nextSortOrder(productId: number): Promise<number> {
  const { count } = await supabaseAdmin
    .from("product_resource_links")
    .select("id", { count: "exact", head: true })
    .eq("catalog_product_id", productId);

  return count ?? 0;
}

export async function linkExistingResource(
  productId: number,
  _prevState: ResourceActionState,
  formData: FormData
): Promise<ResourceActionState> {
  const { data: product, error: productError } = await supabaseAdmin
    .from("catalog_products")
    .select("id")
    .eq("id", productId)
    .single();

  if (productError || !product) {
    return { error: "Product not found." };
  }

  const resourceId = Number(formData.get("resource_id"));

  if (!Number.isFinite(resourceId)) {
    return { error: "Invalid resource selection." };
  }

  const { data: resource, error: resourceError } = await supabaseAdmin
    .from("knowledge_resources")
    .select("id, active")
    .eq("id", resourceId)
    .single();

  if (resourceError || !resource) {
    return { error: "Resource not found." };
  }

  if (!resource.active) {
    return { error: "This resource is archived and cannot be linked." };
  }

  const sortOrder = await nextSortOrder(productId);

  const { error: linkError } = await supabaseAdmin.from("product_resource_links").insert({
    catalog_product_id: productId,
    resource_id: resourceId,
    relationship_type: null,
    required: false,
    notes: null,
    sort_order: sortOrder,
  });

  if (linkError) {
    if (linkError.code === "23505") {
      return { error: "This resource is already linked to this product." };
    }

    return { error: "Failed to link resource to product. Please try again." };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/resources`);

  return { error: null };
}

export async function updateProductResourceLink(
  productId: number,
  linkId: number,
  _prevState: ResourceActionState,
  formData: FormData
): Promise<ResourceActionState> {
  const { data: link, error: linkFetchError } = await supabaseAdmin
    .from("product_resource_links")
    .select("id, catalog_product_id")
    .eq("id", linkId)
    .single();

  if (linkFetchError || !link || link.catalog_product_id !== productId) {
    return { error: "Resource link not found." };
  }

  const relationshipType = field(formData, "relationship_type");
  const required = checkbox(formData, "required");
  const notes = field(formData, "notes");
  const sortOrderRaw = Number(formData.get("sort_order"));
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0;

  const { error: updateError } = await supabaseAdmin
    .from("product_resource_links")
    .update({
      relationship_type: relationshipType || null,
      required,
      notes: notes || null,
      sort_order: sortOrder,
    })
    .eq("id", linkId);

  if (updateError) {
    return { error: "Failed to update resource link. Please try again." };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/resources`);

  return { error: null };
}

export async function unlinkProductResource(
  productId: number,
  linkId: number,
  _prevState: ResourceActionState,
  _formData: FormData
): Promise<ResourceActionState> {
  const { data: link, error: linkFetchError } = await supabaseAdmin
    .from("product_resource_links")
    .select("id, catalog_product_id")
    .eq("id", linkId)
    .single();

  if (linkFetchError || !link || link.catalog_product_id !== productId) {
    return { error: "Resource link not found." };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("product_resource_links")
    .delete()
    .eq("id", linkId);

  if (deleteError) {
    return { error: "Failed to unlink resource. Please try again." };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/resources`);

  return { error: null };
}
