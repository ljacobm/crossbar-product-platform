"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { WORKFLOW_STATUSES, isWorkflowStatus, type WorkflowStatus } from "@/lib/workflowOptions";

export type BulkActionState = { error: string | null };

async function validateIds(productIds: number[]): Promise<{ ids: number[] } | { error: string }> {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return { error: "No products selected." };
  }

  if (!productIds.every((id) => Number.isFinite(id))) {
    return { error: "One or more selected product IDs are invalid." };
  }

  const { data, error } = await supabaseAdmin
    .from("catalog_products")
    .select("id")
    .in("id", productIds);

  if (error) {
    return { error: "Failed to verify selected products. Please try again." };
  }

  const found = new Set((data ?? []).map((row) => row.id));
  const missing = productIds.filter((id) => !found.has(id));

  if (missing.length > 0) {
    return {
      error: `${missing.length} of ${productIds.length} selected products could not be found. No changes were made.`,
    };
  }

  return { ids: productIds };
}

function revalidateCatalog(ids: number[]) {
  revalidatePath("/products");
  revalidatePath("/dashboard");
  for (const id of ids) {
    revalidatePath(`/products/${id}`);
  }
}

export async function bulkUpdateWorkflowStatus(
  productIds: number[],
  status: WorkflowStatus
): Promise<BulkActionState> {
  const check = await validateIds(productIds);
  if ("error" in check) return { error: check.error };
  const { ids } = check;

  if (!isWorkflowStatus(status)) {
    return { error: `Workflow status must be one of: ${WORKFLOW_STATUSES.join(", ")}.` };
  }

  const nowIso = new Date().toISOString();

  if (status === "Website Ready") {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("catalog_settings")
      .select("catalog_product_id, approved_at")
      .in("catalog_product_id", ids);

    if (fetchError) {
      return { error: "Failed to load existing catalog status. Please try again." };
    }

    const approvedAtById = new Map(
      (existing ?? []).map((row) => [row.catalog_product_id, row.approved_at])
    );

    const rows = ids.map((id) => ({
      catalog_product_id: id,
      workflow_status: status,
      website_ready: true,
      website_ready_at: nowIso,
      approved_at: approvedAtById.get(id) || nowIso,
    }));

    const { error } = await supabaseAdmin
      .from("catalog_settings")
      .upsert(rows, { onConflict: "catalog_product_id" });

    if (error) return { error: "Failed to update products. Please try again." };

    revalidateCatalog(ids);
    return { error: null };
  }

  const rows = ids.map((id) => {
    const row: Record<string, unknown> = { catalog_product_id: id, workflow_status: status };
    if (status === "Approved") {
      row.approved_at = nowIso;
    }
    return row;
  });

  const { error } = await supabaseAdmin
    .from("catalog_settings")
    .upsert(rows, { onConflict: "catalog_product_id" });

  if (error) return { error: "Failed to update products. Please try again." };

  revalidateCatalog(ids);
  return { error: null };
}

export async function bulkSetTeamStoreEnabled(
  productIds: number[],
  enabled: boolean
): Promise<BulkActionState> {
  const check = await validateIds(productIds);
  if ("error" in check) return { error: check.error };
  const { ids } = check;

  const rows = ids.map((id) => ({ catalog_product_id: id, team_store_enabled: enabled }));

  const { error } = await supabaseAdmin
    .from("catalog_settings")
    .upsert(rows, { onConflict: "catalog_product_id" });

  if (error) return { error: "Failed to update products. Please try again." };

  revalidateCatalog(ids);
  return { error: null };
}

export async function bulkArchiveProducts(productIds: number[]): Promise<BulkActionState> {
  const check = await validateIds(productIds);
  if ("error" in check) return { error: check.error };
  const { ids } = check;

  const { error: productError } = await supabaseAdmin
    .from("catalog_products")
    .update({ active: false })
    .in("id", ids);

  if (productError) return { error: "Failed to archive products. Please try again." };

  const rows = ids.map((id) => ({ catalog_product_id: id, workflow_status: "Archived" }));

  const { error: settingsError } = await supabaseAdmin
    .from("catalog_settings")
    .upsert(rows, { onConflict: "catalog_product_id" });

  if (settingsError) return { error: "Failed to update catalog status. Please try again." };

  revalidateCatalog(ids);
  return { error: null };
}
