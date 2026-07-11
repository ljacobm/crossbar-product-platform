"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  IMAGE_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
  STORAGE_BUCKET,
} from "@/lib/imageOptions";

export type ImageActionState = {
  error: string | null;
};

function field(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function checkbox(value: FormDataEntryValue | null | undefined): boolean {
  return value === "on" || value === "true";
}

function extensionForFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) {
    return fromName;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function revalidateProductViews(productId: number) {
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/images`);
}

type ProductCheckResult =
  | { error: string; product?: undefined }
  | { error: null; product: { id: number; source_type: string } };

async function assertUploadableProduct(productId: number): Promise<ProductCheckResult> {
  const { data: product, error } = await supabaseAdmin
    .from("catalog_products")
    .select("id, source_type")
    .eq("id", productId)
    .single();

  if (error || !product) {
    return { error: "Product not found." };
  }

  if (product.source_type !== "crossbar" && product.source_type !== "bundle") {
    return {
      error: "Only Crossbar or bundle products can have uploaded images.",
    };
  }

  return { error: null, product };
}

async function enforceSingleHero(productId: number, designatedHeroId: number) {
  await supabaseAdmin
    .from("product_images")
    .update({ image_type: "gallery" })
    .eq("catalog_product_id", productId)
    .eq("image_type", "hero")
    .neq("id", designatedHeroId);

  await supabaseAdmin
    .from("product_images")
    .update({ image_type: "hero" })
    .eq("id", designatedHeroId);
}

export async function uploadProductImages(
  productId: number,
  _prevState: ImageActionState,
  formData: FormData
): Promise<ImageActionState> {
  const productCheck = await assertUploadableProduct(productId);
  if (productCheck.error !== null) {
    return { error: productCheck.error };
  }

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const imageTypes = formData.getAll("image_type").map(String);
  const altTexts = formData.getAll("alt_text").map(String);
  const captions = formData.getAll("caption").map(String);
  const heroFlags = formData.getAll("is_hero").map((value) => checkbox(value));

  if (files.length === 0) {
    return { error: "Select at least one image to upload." };
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      return { error: `"${file.name}" is not a supported image type. Use JPG, PNG, or WebP.` };
    }

    if (file.size > MAX_IMAGE_FILE_SIZE) {
      return { error: `"${file.name}" exceeds the 6 MB size limit.` };
    }

    const requestedType = heroFlags[i] ? "hero" : imageTypes[i] || "gallery";
    if (!IMAGE_TYPES.includes(requestedType as (typeof IMAGE_TYPES)[number])) {
      return { error: `Invalid image type for "${file.name}".` };
    }

    if (heroFlags[i] && !altTexts[i]?.trim()) {
      return { error: `"${file.name}" is set as the hero image and requires alt text.` };
    }
  }

  const { count: existingCount } = await supabaseAdmin
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("catalog_product_id", productId);

  const { data: existingHero } = await supabaseAdmin
    .from("product_images")
    .select("id")
    .eq("catalog_product_id", productId)
    .eq("image_type", "hero")
    .eq("active", true)
    .maybeSingle();

  const uploadedPaths: string[] = [];
  const insertedIds: number[] = [];
  let designatedHeroId: number | null = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isHero = heroFlags[i];
    const imageType = isHero ? "hero" : imageTypes[i] || "gallery";
    const altText = altTexts[i]?.trim() || null;
    const caption = captions[i]?.trim() || null;

    const extension = extensionForFile(file);
    const storagePath = `products/${productId}/${randomUUID()}.${extension}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      // Roll back anything already uploaded in this batch.
      if (uploadedPaths.length > 0) {
        await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      }
      if (insertedIds.length > 0) {
        await supabaseAdmin.from("product_images").delete().in("id", insertedIds);
      }
      return { error: `Failed to upload "${file.name}". Please try again.` };
    }

    uploadedPaths.push(storagePath);

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("product_images")
      .insert({
        catalog_product_id: productId,
        supplier_product_id: null,
        color_name: null,
        image_url: publicUrlData.publicUrl,
        storage_path: storagePath,
        image_type: imageType,
        alt_text: altText,
        caption,
        sort_order: (existingCount ?? 0) + i,
        active: true,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      if (insertedIds.length > 0) {
        await supabaseAdmin.from("product_images").delete().in("id", insertedIds);
      }
      return { error: `Failed to save "${file.name}". Please try again.` };
    }

    insertedIds.push(inserted.id);

    if (isHero) {
      designatedHeroId = inserted.id;
    }
  }

  if (!designatedHeroId && !existingHero && insertedIds.length > 0) {
    designatedHeroId = insertedIds[0];
  }

  if (designatedHeroId) {
    await enforceSingleHero(productId, designatedHeroId);
  }

  await revalidateProductViews(productId);

  return { error: null };
}

type EditableImageResult =
  | { error: string; image?: undefined }
  | {
      error: null;
      image: {
        id: number;
        catalog_product_id: number;
        supplier_product_id: number | null;
        storage_path: string | null;
        image_type: string;
      };
    };

async function loadEditableImage(
  productId: number,
  imageId: number
): Promise<EditableImageResult> {
  const { data: image, error } = await supabaseAdmin
    .from("product_images")
    .select("id, catalog_product_id, supplier_product_id, storage_path, image_type")
    .eq("id", imageId)
    .single();

  if (error || !image || image.catalog_product_id !== productId) {
    return { error: "Image not found." };
  }

  if (image.supplier_product_id !== null) {
    return {
      error: "Supplier images are managed by the supplier import and cannot be changed here.",
    };
  }

  return { error: null, image };
}

export async function updateProductImage(
  productId: number,
  imageId: number,
  _prevState: ImageActionState,
  formData: FormData
): Promise<ImageActionState> {
  const check = await loadEditableImage(productId, imageId);
  if (check.error !== null) {
    return { error: check.error };
  }

  const imageType = field(formData, "image_type") || "gallery";
  const altText = field(formData, "alt_text");
  const caption = field(formData, "caption");
  const sortOrderRaw = Number(formData.get("sort_order"));
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0;
  const active = checkbox(formData.get("active"));

  if (!IMAGE_TYPES.includes(imageType as (typeof IMAGE_TYPES)[number])) {
    return { error: "Invalid image type." };
  }

  if (imageType === "hero" && !altText) {
    return { error: "The hero image requires alt text." };
  }

  const { error: updateError } = await supabaseAdmin
    .from("product_images")
    .update({
      image_type: imageType,
      alt_text: altText || null,
      caption: caption || null,
      sort_order: sortOrder,
      active,
    })
    .eq("id", imageId);

  if (updateError) {
    return { error: "Failed to update image. Please try again." };
  }

  if (imageType === "hero" && active) {
    await enforceSingleHero(productId, imageId);
  }

  await revalidateProductViews(productId);

  return { error: null };
}

export async function setHeroProductImage(
  productId: number,
  imageId: number,
  _prevState: ImageActionState,
  _formData: FormData
): Promise<ImageActionState> {
  const check = await loadEditableImage(productId, imageId);
  if (check.error !== null) {
    return { error: check.error };
  }

  const { data: current } = await supabaseAdmin
    .from("product_images")
    .select("alt_text, active")
    .eq("id", imageId)
    .single();

  if (!current?.active) {
    return { error: "Restore this image before setting it as the hero." };
  }

  if (!current?.alt_text?.trim()) {
    return { error: "Add alt text to this image before setting it as the hero." };
  }

  await enforceSingleHero(productId, imageId);
  await revalidateProductViews(productId);

  return { error: null };
}

export async function archiveProductImage(
  productId: number,
  imageId: number,
  _prevState: ImageActionState,
  _formData: FormData
): Promise<ImageActionState> {
  const check = await loadEditableImage(productId, imageId);
  if (check.error !== null) {
    return { error: check.error };
  }

  const { error } = await supabaseAdmin
    .from("product_images")
    .update({ active: false })
    .eq("id", imageId);

  if (error) {
    return { error: "Failed to archive image. Please try again." };
  }

  await revalidateProductViews(productId);

  return { error: null };
}

export async function restoreProductImage(
  productId: number,
  imageId: number,
  _prevState: ImageActionState,
  _formData: FormData
): Promise<ImageActionState> {
  const check = await loadEditableImage(productId, imageId);
  if (check.error !== null) {
    return { error: check.error };
  }

  const { error } = await supabaseAdmin
    .from("product_images")
    .update({ active: true })
    .eq("id", imageId);

  if (error) {
    return { error: "Failed to restore image. Please try again." };
  }

  await revalidateProductViews(productId);

  return { error: null };
}

export async function deleteProductImage(
  productId: number,
  imageId: number,
  _prevState: ImageActionState,
  _formData: FormData
): Promise<ImageActionState> {
  const check = await loadEditableImage(productId, imageId);
  if (check.error !== null) {
    return { error: check.error };
  }

  const { image } = check;

  if (!image.storage_path) {
    return {
      error: "Only uploaded images can be permanently removed.",
    };
  }

  const { error: storageError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .remove([image.storage_path]);

  if (storageError) {
    return { error: "Failed to remove the image file. Please try again." };
  }

  const { error: deleteError } = await supabaseAdmin
    .from("product_images")
    .delete()
    .eq("id", imageId);

  if (deleteError) {
    return { error: "Failed to delete image record. Please try again." };
  }

  await revalidateProductViews(productId);

  return { error: null };
}
