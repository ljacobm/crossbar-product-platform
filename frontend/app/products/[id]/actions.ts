"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STORAGE_BUCKET } from "@/lib/imageOptions";
import { WORKFLOW_STATUSES, isWorkflowStatus } from "@/lib/workflowOptions";

export type ActionState = {
  error: string | null;
};

export async function updateCatalogStatus(
  catalogProductId: number,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const status = String(formData.get("workflow_status") || "");
  const websiteReady = formData.get("website_ready") === "on";
  const teamStoreEnabled = formData.get("team_store_enabled") === "on";

  if (!isWorkflowStatus(status)) {
    return { error: `Workflow status must be one of: ${WORKFLOW_STATUSES.join(", ")}.` };
  }

  const updates: Record<string, unknown> = {
    catalog_product_id: catalogProductId,
    workflow_status: status,
    website_ready: websiteReady,
    team_store_enabled: teamStoreEnabled,
  };

  if (status === "Approved") {
    updates.approved_at = new Date().toISOString();
  }

  if (status === "Website Ready") {
    updates.website_ready = true;
    updates.website_ready_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("catalog_settings")
    .upsert(updates, { onConflict: "catalog_product_id" });

  if (error) {
    return { error: "Failed to update catalog status. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${catalogProductId}`);
  revalidatePath("/dashboard");

  return { error: null };
}

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
    .eq("child_catalog_product_id", catalogProductId)
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

  const { data: uploadedImages, error: imagesError } = await supabaseAdmin
    .from("product_images")
    .select("storage_path")
    .eq("catalog_product_id", catalogProductId)
    .not("storage_path", "is", null);

  if (imagesError) {
    return { error: "Could not verify uploaded images. Please try again." };
  }

  const storagePaths = (uploadedImages ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      return {
        error: "Failed to remove uploaded product images from storage. Please try again.",
      };
    }
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
