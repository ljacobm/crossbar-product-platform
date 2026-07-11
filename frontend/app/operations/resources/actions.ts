"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { RESOURCE_TYPES, RESOURCE_STATUSES } from "@/lib/resourceOptions";
import { sanitizeResourceHtml } from "@/lib/sanitizeHtml";

export type ResourceFormState = {
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

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function isValidUrl(value: string): boolean {
  if (!value) return true;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function nextSortOrder(productId: number): Promise<number> {
  const { count } = await supabaseAdmin
    .from("product_resource_links")
    .select("id", { count: "exact", head: true })
    .eq("catalog_product_id", productId);

  return count ?? 0;
}

async function generateUniqueSlug(title: string, excludeId?: number): Promise<string> {
  const base = slugify(title) || "resource";
  let candidate = base;
  let suffix = 1;

  while (true) {
    let query = supabaseAdmin.from("knowledge_resources").select("id").eq("slug", candidate);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data } = await query.maybeSingle();

    if (!data) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;

    if (suffix > 50) {
      return `${base}-${Date.now()}`;
    }
  }
}

async function revalidateLinkedProducts(resourceId: number) {
  const { data: links } = await supabaseAdmin
    .from("product_resource_links")
    .select("catalog_product_id")
    .eq("resource_id", resourceId);

  for (const link of links || []) {
    revalidatePath(`/products/${link.catalog_product_id}`);
    revalidatePath(`/products/${link.catalog_product_id}/resources`);
  }
}

type ParsedResourceFields = {
  title: string;
  resourceType: string;
  summary: string;
  department: string;
  version: string;
  status: string;
  ownerName: string;
  estimatedMinutes: number | null;
  contentHtml: string;
  fileUrl: string;
  externalUrl: string;
  active: boolean;
};

function parseCommonFields(formData: FormData): ParsedResourceFields | { error: string } {
  const title = field(formData, "title");
  const resourceType = field(formData, "resource_type");
  const summary = field(formData, "summary");
  const department = field(formData, "department");
  const version = field(formData, "version");
  const status = field(formData, "status") || "Draft";
  const ownerName = field(formData, "owner_name");
  const estimatedMinutesRaw = field(formData, "estimated_minutes");
  const contentHtmlRaw = field(formData, "content_html");
  const fileUrl = field(formData, "file_url");
  const externalUrl = field(formData, "external_url");

  if (!title) {
    return { error: "Title is required." };
  }

  if (!RESOURCE_TYPES.includes(resourceType as (typeof RESOURCE_TYPES)[number])) {
    return { error: "Invalid resource type." };
  }

  if (!RESOURCE_STATUSES.includes(status as (typeof RESOURCE_STATUSES)[number])) {
    return { error: "Invalid resource status." };
  }

  let estimatedMinutes: number | null = null;

  if (estimatedMinutesRaw) {
    const parsed = Number(estimatedMinutesRaw);

    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      return { error: "Estimated minutes must be a nonnegative whole number." };
    }

    estimatedMinutes = parsed;
  }

  if (!isValidUrl(fileUrl)) {
    return { error: "Primary file URL must be a valid http or https URL." };
  }

  if (!isValidUrl(externalUrl)) {
    return { error: "External URL must be a valid http or https URL." };
  }

  return {
    title,
    resourceType,
    summary,
    department,
    version,
    status,
    ownerName,
    estimatedMinutes,
    contentHtml: sanitizeResourceHtml(contentHtmlRaw),
    fileUrl,
    externalUrl,
    active: checkbox(formData, "active"),
  };
}

export async function createKnowledgeResource(
  productId: number | null,
  _prevState: ResourceFormState,
  formData: FormData
): Promise<ResourceFormState> {
  if (productId !== null) {
    const { data: product, error: productError } = await supabaseAdmin
      .from("catalog_products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return { error: "Product not found." };
    }
  }

  const parsed = parseCommonFields(formData);

  if ("error" in parsed) {
    return parsed;
  }

  const slug = await generateUniqueSlug(parsed.title);

  const { data: resource, error: resourceError } = await supabaseAdmin
    .from("knowledge_resources")
    .insert({
      resource_type: parsed.resourceType,
      title: parsed.title,
      summary: parsed.summary || null,
      content_html: parsed.contentHtml || null,
      version: parsed.version || null,
      status: parsed.status,
      file_url: parsed.fileUrl || null,
      external_url: parsed.externalUrl || null,
      slug,
      department: parsed.department || null,
      owner_name: parsed.ownerName || null,
      estimated_minutes: parsed.estimatedMinutes,
      active: parsed.active,
    })
    .select("id")
    .single();

  if (resourceError || !resource) {
    if (resourceError?.code === "23505") {
      return {
        error: "A resource with this slug already exists. Please try a different title.",
      };
    }

    return {
      error: resourceError?.message || "Failed to create resource. Please try again.",
    };
  }

  if (productId !== null) {
    const relationshipType = field(formData, "relationship_type");
    const required = checkbox(formData, "required");
    const notes = field(formData, "notes");
    const sortOrder = await nextSortOrder(productId);

    const { error: linkError } = await supabaseAdmin.from("product_resource_links").insert({
      catalog_product_id: productId,
      resource_id: resource.id,
      relationship_type: relationshipType || null,
      required,
      notes: notes || null,
      sort_order: sortOrder,
    });

    if (linkError) {
      await supabaseAdmin.from("knowledge_resources").delete().eq("id", resource.id);

      if (linkError.code === "23505") {
        return { error: "This resource is already linked to this product." };
      }

      return { error: "Failed to link resource to product. Please try again." };
    }

    revalidatePath(`/products/${productId}`);
    revalidatePath(`/products/${productId}/resources`);
    revalidatePath("/operations/resources");
    redirect(`/products/${productId}/resources`);
  }

  revalidatePath("/operations/resources");
  redirect(`/operations/resources/${resource.id}`);
}

export async function updateKnowledgeResource(
  resourceId: number,
  _prevState: ResourceFormState,
  formData: FormData
): Promise<ResourceFormState> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("knowledge_resources")
    .select("id, slug, title")
    .eq("id", resourceId)
    .single();

  if (fetchError || !existing) {
    return { error: "Resource not found." };
  }

  const parsed = parseCommonFields(formData);

  if ("error" in parsed) {
    return parsed;
  }

  let slug = existing.slug;

  if (!slug || existing.title !== parsed.title) {
    slug = await generateUniqueSlug(parsed.title, resourceId);
  }

  const { error: updateError } = await supabaseAdmin
    .from("knowledge_resources")
    .update({
      resource_type: parsed.resourceType,
      title: parsed.title,
      summary: parsed.summary || null,
      content_html: parsed.contentHtml || null,
      version: parsed.version || null,
      status: parsed.status,
      file_url: parsed.fileUrl || null,
      external_url: parsed.externalUrl || null,
      slug,
      department: parsed.department || null,
      owner_name: parsed.ownerName || null,
      estimated_minutes: parsed.estimatedMinutes,
      active: parsed.active,
    })
    .eq("id", resourceId);

  if (updateError) {
    if (updateError.code === "23505") {
      return {
        error: "A resource with this slug already exists. Please try a different title.",
      };
    }

    return {
      error: updateError.message || "Failed to update resource. Please try again.",
    };
  }

  revalidatePath("/operations/resources");
  revalidatePath(`/operations/resources/${resourceId}`);
  await revalidateLinkedProducts(resourceId);

  redirect(`/operations/resources/${resourceId}`);
}

export async function archiveKnowledgeResource(
  resourceId: number,
  _prevState: ResourceFormState,
  _formData: FormData
): Promise<ResourceFormState> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("knowledge_resources")
    .select("id")
    .eq("id", resourceId)
    .single();

  if (fetchError || !existing) {
    return { error: "Resource not found." };
  }

  const { error } = await supabaseAdmin
    .from("knowledge_resources")
    .update({ active: false, status: "Archived" })
    .eq("id", resourceId);

  if (error) {
    return { error: "Failed to archive resource. Please try again." };
  }

  revalidatePath("/operations/resources");
  revalidatePath(`/operations/resources/${resourceId}`);
  await revalidateLinkedProducts(resourceId);

  return { error: null };
}

export async function restoreKnowledgeResource(
  resourceId: number,
  _prevState: ResourceFormState,
  _formData: FormData
): Promise<ResourceFormState> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("knowledge_resources")
    .select("id, status")
    .eq("id", resourceId)
    .single();

  if (fetchError || !existing) {
    return { error: "Resource not found." };
  }

  const nextStatus = existing.status === "Archived" ? "Draft" : existing.status;

  const { error } = await supabaseAdmin
    .from("knowledge_resources")
    .update({ active: true, status: nextStatus })
    .eq("id", resourceId);

  if (error) {
    return { error: "Failed to restore resource. Please try again." };
  }

  revalidatePath("/operations/resources");
  revalidatePath(`/operations/resources/${resourceId}`);
  await revalidateLinkedProducts(resourceId);

  return { error: null };
}
