"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ActionState = {
  error: string | null;
};

export async function archiveProduct(
  catalogProductId: number,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const { error } = await supabaseAdmin
    .from("catalog_products")
    .update({ active: false })
    .eq("id", catalogProductId);

  if (error) {
    return { error: "Failed to archive product. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${catalogProductId}`);

  return { error: null };
}

export async function restoreProduct(
  catalogProductId: number,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const { error } = await supabaseAdmin
    .from("catalog_products")
    .update({ active: true })
    .eq("id", catalogProductId);

  if (error) {
    return { error: "Failed to restore product. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${catalogProductId}`);

  return { error: null };
}

export async function deleteProductPermanently(
  catalogProductId: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const confirmSku = String(formData.get("confirm_sku") || "").trim();

  const { data: product, error: fetchError } = await supabaseAdmin
    .from("catalog_products")
    .select("id, crossbar_sku, source_type")
    .eq("id", catalogProductId)
    .single();

  if (fetchError || !product) {
    return { error: "Product not found." };
  }

  if (product.source_type !== "crossbar" && product.source_type !== "bundle") {
    return {
      error: "Only Crossbar or Bundle products can be permanently deleted.",
    };
  }

  if (!confirmSku || confirmSku !== product.crossbar_sku) {
    return {
      error: "Confirmation text does not match the product SKU.",
    };
  }

  const { data: bundleRefs, error: bundleError } = await supabaseAdmin
    .from("product_bundle_items")
    .select("id")
    .or(
      `bundle_catalog_product_id.eq.${catalogProductId},child_catalog_product_id.eq.${catalogProductId}`
    )
    .limit(1);

  if (bundleError) {
    return { error: "Could not verify bundle references. Please try again." };
  }

  if (bundleRefs && bundleRefs.length > 0) {
    return {
      error:
        "This product is referenced by a bundle and cannot be deleted. Remove the bundle reference first.",
    };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("catalog_products")
    .delete()
    .eq("id", catalogProductId);

  if (deleteError) {
    return { error: "Failed to delete product. Please try again." };
  }

  revalidatePath("/products");
  redirect("/products");
}
