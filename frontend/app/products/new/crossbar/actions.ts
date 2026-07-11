"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CrossbarProductFormState = {
  error: string | null;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function field(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

export async function createCrossbarProduct(
  _prevState: CrossbarProductFormState,
  formData: FormData
): Promise<CrossbarProductFormState> {
  const displayName = field(formData, "display_name");
  const crossbarSku = field(formData, "crossbar_sku").toUpperCase();
  const brandDisplay = field(formData, "brand_display");
  const crossbarCategory = field(formData, "crossbar_category");
  const productFamily = field(formData, "product_family");
  const productionMethod = field(formData, "production_method");
  const baseTemplate = field(formData, "base_template");
  const defaultSizeRange = field(formData, "default_size_range");
  const descriptionHtml = field(formData, "description_html");
  const productionNotes = field(formData, "production_notes");

  if (!displayName || !crossbarSku || !brandDisplay || !crossbarCategory) {
    return {
      error: "Product name, SKU, brand, and category are required.",
    };
  }

  const productSlug = `${slugify(displayName)}-${slugify(crossbarSku)}`;

  const { data: catalogProduct, error: catalogError } = await supabaseAdmin
    .from("catalog_products")
    .insert({
      crossbar_sku: crossbarSku,
      source_type: "crossbar",
      display_name: displayName,
      product_slug: productSlug,
      description_html: descriptionHtml || null,
      crossbar_category: crossbarCategory,
      brand_display: brandDisplay,
      active: true,
    })
    .select("id")
    .single();

  if (catalogError || !catalogProduct) {
    if (catalogError?.code === "23505") {
      if (catalogError.message.includes("crossbar_sku")) {
        return {
          error: `A product with SKU "${crossbarSku}" already exists.`,
        };
      }

      if (catalogError.message.includes("product_slug")) {
        return {
          error: "A product with this name and SKU already exists.",
        };
      }

      return { error: "This product already exists." };
    }

    return {
      error: catalogError?.message || "Failed to create product. Please try again.",
    };
  }

  const { error: crossbarError } = await supabaseAdmin
    .from("crossbar_product_data")
    .insert({
      catalog_product_id: catalogProduct.id,
      product_family: productFamily || null,
      production_method: productionMethod || null,
      base_template: baseTemplate || null,
      default_size_range: defaultSizeRange || null,
      production_notes: productionNotes || null,
      active: true,
    });

  if (crossbarError) {
    await supabaseAdmin
      .from("catalog_products")
      .delete()
      .eq("id", catalogProduct.id);

    return {
      error: "Failed to save Crossbar product details. Please try again.",
    };
  }

  revalidatePath("/products");
  redirect(`/products/${catalogProduct.id}`);
}
