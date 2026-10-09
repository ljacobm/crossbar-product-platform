"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";

// Server-only read path for knowledge_resources and product_resource_links
// -- Phase B, first slice of the post-Stage-1 RLS follow-up (see
// docs/roadmap.md / docs/decisions.md). Mirrors the existing
// lib/onlineStoreData.ts pattern: one small "use server" data module per
// table/feature, every exported function calling requireStaffSession()
// first, reads go through supabaseAdmin so they keep working the moment
// RLS is enabled on these two tables (not yet enabled -- see the Phase B
// migration notes). Mutations already went through supabaseAdmin before
// this change (see app/(internal)/operations/resources/actions.ts and
// app/(internal)/products/[id]/resources/actions.ts) -- this module only
// replaces the read side.

export type ResourceLibraryRawRow = {
  id: number;
  resource_type: string;
  title: string;
  summary: string | null;
  department: string | null;
  version: string | null;
  status: string;
  active: boolean;
  updated_at: string;
  linked: { count: number }[] | null;
};

export type ResourceLibraryFilters = {
  q?: string;
  type?: string;
  status?: string;
  department?: string;
  activeFilter?: string;
};

export type ResourceLibraryData = {
  resources: ResourceLibraryRawRow[];
  count: number;
  stats: { total: number; approved: number; draft: number; archived: number };
  departments: string[];
};

// Backs the Knowledge & SOP Library list page: stat counts, the
// department facet list, and the filtered/paginated resource list,
// exactly as that page built them inline before.
export async function getResourceLibraryData(
  filters: ResourceLibraryFilters
): Promise<ResourceLibraryData> {
  await requireStaffSession();

  const { q = "", type = "", status = "", department = "", activeFilter = "active" } = filters;

  const [totalRes, approvedRes, draftRes, archivedRes, deptRows] = await Promise.all([
    supabaseAdmin.from("knowledge_resources").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("knowledge_resources")
      .select("id", { count: "exact", head: true })
      .eq("status", "Approved"),
    supabaseAdmin
      .from("knowledge_resources")
      .select("id", { count: "exact", head: true })
      .eq("status", "Draft"),
    supabaseAdmin
      .from("knowledge_resources")
      .select("id", { count: "exact", head: true })
      .eq("status", "Archived"),
    supabaseAdmin.from("knowledge_resources").select("department").not("department", "is", null),
  ]);

  const departments = Array.from(
    new Set(
      (deptRows.data || [])
        .map((row) => row.department as string | null)
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  let query = supabaseAdmin
    .from("knowledge_resources")
    .select(
      `
      id,
      resource_type,
      title,
      summary,
      department,
      version,
      status,
      active,
      updated_at,
      linked:product_resource_links(count)
      `,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (activeFilter === "active") {
    query = query.eq("active", true);
  } else if (activeFilter === "archived") {
    query = query.eq("active", false);
  }

  if (type) {
    query = query.eq("resource_type", type);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (department) {
    query = query.eq("department", department);
  }

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `title.ilike.%${escaped}%,summary.ilike.%${escaped}%,department.ilike.%${escaped}%,resource_type.ilike.%${escaped}%`
    );
  }

  const { data, count } = await query;

  return {
    resources: (data as unknown as ResourceLibraryRawRow[]) ?? [],
    count: count ?? 0,
    stats: {
      total: totalRes.count ?? 0,
      approved: approvedRes.count ?? 0,
      draft: draftRes.count ?? 0,
      archived: archivedRes.count ?? 0,
    },
    departments,
  };
}

export type KnowledgeResourceDetail = {
  id: number;
  resource_type: string;
  title: string;
  summary: string | null;
  content_html: string | null;
  version: string | null;
  status: string;
  file_url: string | null;
  external_url: string | null;
  slug: string | null;
  department: string | null;
  owner_name: string | null;
  estimated_minutes: number | null;
  active: boolean;
  updated_at: string;
};

export type LinkedProductRaw = {
  id: number;
  product: {
    id: number;
    display_name: string;
    crossbar_sku: string;
    source_type: string;
    active: boolean;
    product_images: { id: number; image_url: string; sort_order: number | null }[];
  } | null;
};

// Backs the resource viewer page: the resource itself, plus every product
// linked to it (joined through product_resource_links -> catalog_products
// for display). catalog_products/product_images columns ride along as a
// nested embed of this product_resource_links query -- they aren't a
// separate top-level read, and catalog_products' own RLS posture (none
// yet) is unchanged either way.
export async function getKnowledgeResourceWithLinkedProducts(
  id: string | number
): Promise<{ resource: KnowledgeResourceDetail | null; linkedProducts: LinkedProductRaw[] }> {
  await requireStaffSession();

  const { data: resource, error } = await supabaseAdmin
    .from("knowledge_resources")
    .select(
      `
      id,
      resource_type,
      title,
      summary,
      content_html,
      version,
      status,
      file_url,
      external_url,
      slug,
      department,
      owner_name,
      estimated_minutes,
      active,
      updated_at
      `
    )
    .eq("id", id)
    .single();

  if (error || !resource) {
    return { resource: null, linkedProducts: [] };
  }

  const { data: linkedProductsRaw } = await supabaseAdmin
    .from("product_resource_links")
    .select(
      `
      id,
      product:catalog_products (
        id,
        display_name,
        crossbar_sku,
        source_type,
        active,
        product_images (
          id,
          image_url,
          sort_order
        )
      )
      `
    )
    .eq("resource_id", id)
    .order("id", { ascending: true });

  return {
    resource: resource as KnowledgeResourceDetail,
    linkedProducts: (linkedProductsRaw as unknown as LinkedProductRaw[]) ?? [],
  };
}

export type KnowledgeResourceEditRow = {
  id: number;
  title: string;
  resource_type: string;
  summary: string | null;
  department: string | null;
  version: string | null;
  status: string;
  owner_name: string | null;
  estimated_minutes: number | null;
  content_html: string | null;
  file_url: string | null;
  external_url: string | null;
  active: boolean;
};

// Backs the resource edit page's initial load.
export async function getKnowledgeResourceForEdit(
  id: string | number
): Promise<KnowledgeResourceEditRow | null> {
  await requireStaffSession();

  const { data, error } = await supabaseAdmin
    .from("knowledge_resources")
    .select(
      `
      id,
      title,
      resource_type,
      summary,
      department,
      version,
      status,
      owner_name,
      estimated_minutes,
      content_html,
      file_url,
      external_url,
      active
      `
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as KnowledgeResourceEditRow;
}

export type ProductResourceLinkRaw = {
  id: number;
  relationship_type: string | null;
  required: boolean;
  notes: string | null;
  sort_order: number | null;
  resource: {
    id: number;
    resource_type: string;
    title: string;
    summary: string | null;
    version: string | null;
    status: string;
    file_url: string | null;
    external_url: string | null;
    active: boolean;
  } | null;
};

// Shared by the Product Workspace's resources panel and the dedicated
// /products/[id]/resources page -- both queries were already byte-for-byte
// identical before this change.
export async function getProductResourceLinks(
  catalogProductId: string | number
): Promise<ProductResourceLinkRaw[]> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("product_resource_links")
    .select(
      `
      id,
      relationship_type,
      required,
      notes,
      sort_order,
      resource:knowledge_resources (
        id,
        resource_type,
        title,
        summary,
        version,
        status,
        file_url,
        external_url,
        active
      )
      `
    )
    .eq("catalog_product_id", catalogProductId);

  return (data as unknown as ProductResourceLinkRaw[]) ?? [];
}

// Backs the "exclude already-linked resources" lookup in the resource
// search API before presenting the Available Resources picker.
export async function getLinkedResourceIdsForProduct(
  catalogProductId: string | number
): Promise<number[]> {
  await requireStaffSession();

  const { data } = await supabaseAdmin
    .from("product_resource_links")
    .select("resource_id")
    .eq("catalog_product_id", catalogProductId);

  return (data || []).map((link) => link.resource_id as number);
}

export type KnowledgeResourceSearchRow = {
  id: number;
  resource_type: string;
  title: string;
  summary: string | null;
  version: string | null;
  status: string;
  file_url: string | null;
  external_url: string | null;
  active: boolean;
};

// Backs GET /api/resources/search.
export async function searchKnowledgeResources(filters: {
  q?: string;
  type?: string;
  excludeIds?: number[];
}): Promise<KnowledgeResourceSearchRow[]> {
  await requireStaffSession();

  const { q = "", type = "", excludeIds = [] } = filters;

  let query = supabaseAdmin
    .from("knowledge_resources")
    .select("id, resource_type, title, summary, version, status, file_url, external_url, active")
    .eq("active", true)
    .order("title", { ascending: true })
    .limit(50);

  if (type) {
    query = query.eq("resource_type", type);
  }

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `title.ilike.%${escaped}%,summary.ilike.%${escaped}%,resource_type.ilike.%${escaped}%`
    );
  }

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to search knowledge resources: ${error.message}`);
  }

  return data ?? [];
}
