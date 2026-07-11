"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type UpdateProductFormState = {
  error: string | null;
};

type RawBundleItem = {
  id: number;
  quantity: number;
  required: boolean;
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

function parseBundleItems(raw: string): RawBundleItem[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const items: RawBundleItem[] = [];

  for (const entry of parsed) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { id?: unknown }).id !== "number" ||
      !Number.isFinite((entry as { id: number }).id)
    ) {
      return null;
    }

    const id = (entry as { id: number }).id;
    const quantityRaw = (entry as { quantity?: unknown }).quantity;
    const requiredRaw = (entry as { required?: unknown }).required;

    const quantity =
      typeof quantityRaw === "number" && Number.isFinite(quantityRaw)
        ? Math.max(1, Math.floor(quantityRaw))
        : 1;

    const required = requiredRaw !== false;

    items.push({ id, quantity, required });
  }

  return items;
}

export async function updateProduct(
  productId: number,
  _prevState: UpdateProductFormState,
  formData: FormData
): Promise<UpdateProductFormState> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("catalog_products")
    .select("id, source_type")
    .eq("id", productId)
    .single();

  if (fetchError || !existing) {
    return { error: "Product not found." };
  }

  const sourceType = existing.source_type as string;

  const displayName = field(formData, "display_name");
  const crossbarSku = field(formData, "crossbar_sku").toUpperCase();
  const brandDisplay = field(formData, "brand_display");
  const crossbarCategory = field(formData, "crossbar_category");
  const descriptionHtml = field(formData, "description_html");
  const active = formData.get("active") === "on" || formData.get("active") === "true";

  if (!displayName || !crossbarSku || !brandDisplay || !crossbarCategory) {
    return {
      error: "Product name, SKU, brand, and category are required.",
    };
  }

  const productSlug = `${slugify(displayName)}-${slugify(crossbarSku)}`;

  const { error: updateError } = await supabaseAdmin
    .from("catalog_products")
    .update({
      display_name: displayName,
      crossbar_sku: crossbarSku,
      product_slug: productSlug,
      description_html: descriptionHtml || null,
      crossbar_category: crossbarCategory,
      brand_display: brandDisplay,
      active,
    })
    .eq("id", productId);

  if (updateError) {
    if (updateError.code === "23505") {
      if (updateError.message.includes("crossbar_sku")) {
        return {
          error: `A product with SKU "${crossbarSku}" already exists.`,
        };
      }

      if (updateError.message.includes("product_slug")) {
        return {
          error: "A product with this name and SKU already exists.",
        };
      }

      return { error: "This product already exists." };
    }

    return {
      error: updateError.message || "Failed to update product. Please try again.",
    };
  }

  if (sourceType === "crossbar") {
    const productFamily = field(formData, "product_family");
    const productionMethod = field(formData, "production_method");
    const baseTemplate = field(formData, "base_template");
    const defaultSizeRange = field(formData, "default_size_range");
    const productNotes = field(formData, "product_notes");
    const productionNotes = field(formData, "production_notes");

    const { error: crossbarError } = await supabaseAdmin
      .from("crossbar_product_data")
      .upsert(
        {
          catalog_product_id: productId,
          product_family: productFamily || null,
          production_method: productionMethod || null,
          base_template: baseTemplate || null,
          default_size_range: defaultSizeRange || null,
          product_notes: productNotes || null,
          production_notes: productionNotes || null,
          active: true,
        },
        { onConflict: "catalog_product_id" }
      );

    if (crossbarError) {
      return {
        error: "Failed to save Crossbar product details. Please try again.",
      };
    }
  }

  if (sourceType === "bundle") {
    const itemsJson = field(formData, "items_json");
    const items = parseBundleItems(itemsJson || "[]");

    if (!items) {
      return { error: "Invalid package item data. Please try again." };
    }

    if (items.length === 0) {
      return { error: "Add at least one product to this package." };
    }

    const ids = items.map((item) => item.id);
    const uniqueIds = new Set(ids);

    if (uniqueIds.size !== ids.length) {
      return {
        error: "The same product was added to this package more than once.",
      };
    }

    if (uniqueIds.has(productId)) {
      return { error: "A bundle cannot contain itself." };
    }

    const { data: childProducts, error: childError } = await supabaseAdmin
      .from("catalog_products")
      .select("id, active, source_type")
      .in("id", ids);

    if (childError) {
      return { error: "Failed to verify package items. Please try again." };
    }

    const childById = new Map((childProducts || []).map((p) => [p.id, p]));

    for (const id of ids) {
      const child = childById.get(id);

      if (!child) {
        return { error: "One or more selected products no longer exist." };
      }

      if (!child.active) {
        return { error: "One or more selected products are no longer active." };
      }

      if (child.source_type === "bundle") {
        return { error: "Bundles cannot contain other bundles yet." };
      }
    }

    const { data: previousItems, error: previousError } = await supabaseAdmin
      .from("product_bundle_items")
      .select("child_catalog_product_id, quantity, required, sort_order")
      .eq("bundle_catalog_product_id", productId);

    if (previousError) {
      return { error: "Failed to load existing package items. Please try again." };
    }

    const { error: deleteError } = await supabaseAdmin
      .from("product_bundle_items")
      .delete()
      .eq("bundle_catalog_product_id", productId);

    if (deleteError) {
      return { error: "Failed to update package items. Please try again." };
    }

    const newRows = items.map((item, index) => ({
      bundle_catalog_product_id: productId,
      child_catalog_product_id: item.id,
      quantity: item.quantity,
      required: item.required,
      sort_order: index,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("product_bundle_items")
      .insert(newRows);

    if (insertError) {
      if (previousItems && previousItems.length > 0) {
        await supabaseAdmin.from("product_bundle_items").insert(
          previousItems.map((row) => ({
            bundle_catalog_product_id: productId,
            child_catalog_product_id: row.child_catalog_product_id,
            quantity: row.quantity,
            required: row.required,
            sort_order: row.sort_order,
          }))
        );
      }

      return { error: "Failed to save package items. Please try again." };
    }
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}
