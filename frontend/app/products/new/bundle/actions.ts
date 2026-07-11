"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type BundleProductFormState = {
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

export async function createBundleProduct(
  _prevState: BundleProductFormState,
  formData: FormData
): Promise<BundleProductFormState> {
  const displayName = field(formData, "display_name");
  const crossbarSku = field(formData, "crossbar_sku").toUpperCase();
  const brandDisplay = field(formData, "brand_display");
  const crossbarCategory = field(formData, "crossbar_category");
  const descriptionHtml = field(formData, "description_html");
  const active = formData.get("active") === "on" || formData.get("active") === "true";
  const itemsJson = field(formData, "items_json");

  if (!displayName || !crossbarSku || !brandDisplay || !crossbarCategory) {
    return {
      error: "Bundle name, SKU, brand, and category are required.",
    };
  }

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
    return { error: "The same product was added to this package more than once." };
  }

  const productSlug = `${slugify(displayName)}-${slugify(crossbarSku)}`;

  const { data: bundleProduct, error: catalogError } = await supabaseAdmin
    .from("catalog_products")
    .insert({
      crossbar_sku: crossbarSku,
      source_type: "bundle",
      display_name: displayName,
      product_slug: productSlug,
      description_html: descriptionHtml || null,
      crossbar_category: crossbarCategory,
      brand_display: brandDisplay,
      active,
    })
    .select("id")
    .single();

  if (catalogError || !bundleProduct) {
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
      error: catalogError?.message || "Failed to create bundle. Please try again.",
    };
  }

  const bundleId = bundleProduct.id;

  async function rollback() {
    await supabaseAdmin.from("catalog_products").delete().eq("id", bundleId);
  }

  if (uniqueIds.has(bundleId)) {
    await rollback();
    return { error: "A bundle cannot contain itself." };
  }

  const { data: childProducts, error: childError } = await supabaseAdmin
    .from("catalog_products")
    .select("id, active, source_type")
    .in("id", ids);

  if (childError) {
    await rollback();
    return { error: "Failed to verify package items. Please try again." };
  }

  const childById = new Map((childProducts || []).map((p) => [p.id, p]));

  for (const id of ids) {
    const child = childById.get(id);

    if (!child) {
      await rollback();
      return { error: "One or more selected products no longer exist." };
    }

    if (!child.active) {
      await rollback();
      return { error: "One or more selected products are no longer active." };
    }

    if (child.source_type === "bundle") {
      await rollback();
      return { error: "Bundles cannot contain other bundles yet." };
    }
  }

  const bundleItemRows = items.map((item, index) => ({
    bundle_catalog_product_id: bundleId,
    child_catalog_product_id: item.id,
    quantity: item.quantity,
    required: item.required,
    sort_order: index,
  }));

  const { error: itemsError } = await supabaseAdmin
    .from("product_bundle_items")
    .insert(bundleItemRows);

  if (itemsError) {
    await rollback();
    return { error: "Failed to save package items. Please try again." };
  }

  revalidatePath("/products");
  redirect(`/products/${bundleId}`);
}
