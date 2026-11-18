"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import type {
  CatalogBaselineItem,
  CatalogSubmission,
  CatalogSubmissionItem,
  CatalogSubmissionListEntry,
} from "@/lib/onlineStoreCatalogTypes";

// Staff-facing ("use server") data access for the Online Store
// Builder's per-store approved baseline and the Crossbar approval
// queue (task requirements 2 and 6). Mirrors lib/onlineStoreData.ts's
// pattern exactly -- requireStaffSession() first, every read/write
// through supabaseAdmin. All four underlying tables have RLS enabled
// with zero anon/authenticated policies (see
// database/migrations/20261111b_add_online_store_catalog_builder.sql).
//
// Approval application (moving an approved item into the baseline) is
// plain sequential application-layer logic, not a single atomic
// database transaction/RPC -- an intentional, documented simplification
// given this is a staff-only, one-item-at-a-time review action (not a
// high-concurrency write path like the SanMar inventory sync), matching
// the migration's own stated preference for application code over
// triggers for ordinary workflow transitions. A reviewer re-opening the
// queue after an interrupted click sees accurate current state either
// way -- nothing here can silently corrupt the baseline, at worst a
// decision is left "pending" and simply needs to be re-applied.

function firstRelated<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export async function getOnlineStoreCatalogBaseline(storeId: number): Promise<CatalogBaselineItem[]> {
  await requireStaffSession();
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return [];

  const { data, error } = await supabaseAdmin
    .from("online_store_catalog_baseline")
    .select(
      `
      approved_catalog_style_id, color_name, approved_at, approved_by, shopify_publish_status,
      approved_catalog_styles (
        supplier_products ( catalog_products ( display_name ) )
      )
    `
    )
    .eq("online_store_id", storeId)
    .order("approved_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load catalog baseline for store ${storeId}: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const style = firstRelated(row.approved_catalog_styles);
    const sp = firstRelated(style?.supplier_products);
    const cp = firstRelated(sp?.catalog_products);
    return {
      approvedCatalogStyleId: row.approved_catalog_style_id,
      displayName: cp?.display_name ?? `Style #${row.approved_catalog_style_id}`,
      colorName: row.color_name,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      shopifyPublishStatus: row.shopify_publish_status,
    };
  });
}

function mapSubmissionItemRow(row: {
  id: number;
  approved_catalog_style_id: number;
  color_name: string;
  change_type: "added" | "removed";
  decision: "pending" | "approved" | "rejected";
  decision_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  approved_catalog_styles?: unknown;
}): CatalogSubmissionItem {
  const style = firstRelated(
    row.approved_catalog_styles as
      | { supplier_products?: unknown }
      | { supplier_products?: unknown }[]
      | null
      | undefined
  );
  const sp = firstRelated((style as { supplier_products?: unknown } | undefined)?.supplier_products as
    | { catalog_products?: unknown }
    | { catalog_products?: unknown }[]
    | undefined);
  const cp = firstRelated((sp as { catalog_products?: unknown } | undefined)?.catalog_products as
    | { display_name?: string }
    | { display_name?: string }[]
    | undefined);

  return {
    id: row.id,
    approvedCatalogStyleId: row.approved_catalog_style_id,
    displayName: (cp as { display_name?: string } | undefined)?.display_name ?? `Style #${row.approved_catalog_style_id}`,
    colorName: row.color_name,
    changeType: row.change_type,
    decision: row.decision,
    decisionNotes: row.decision_notes,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
  };
}

const SUBMISSION_ITEM_SELECT = `
  id, approved_catalog_style_id, color_name, change_type, decision, decision_notes, decided_by, decided_at,
  approved_catalog_styles ( supplier_products ( catalog_products ( display_name ) ) )
`;

export async function getCatalogSubmissionWithItems(submissionId: number): Promise<CatalogSubmission | null> {
  await requireStaffSession();
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) return null;

  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("online_store_catalog_submissions")
    .select("id, online_store_id, submitted_at, submitted_by, status, reviewed_by, reviewed_at, review_notes")
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionError) {
    throw new Error(`Failed to load catalog submission ${submissionId}: ${submissionError.message}`);
  }
  if (!submission) return null;

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("online_store_catalog_submission_items")
    .select(SUBMISSION_ITEM_SELECT)
    .eq("submission_id", submissionId)
    .order("id", { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to load items for catalog submission ${submissionId}: ${itemsError.message}`);
  }

  return {
    id: submission.id,
    onlineStoreId: submission.online_store_id,
    submittedAt: submission.submitted_at,
    submittedBy: submission.submitted_by,
    status: submission.status,
    reviewedBy: submission.reviewed_by,
    reviewedAt: submission.reviewed_at,
    reviewNotes: submission.review_notes,
    items: (items ?? []).map(mapSubmissionItemRow),
  };
}

async function listSubmissionEntries(storeId?: number): Promise<CatalogSubmissionListEntry[]> {
  let request = supabaseAdmin
    .from("online_store_catalog_submissions")
    .select(
      `
      id, online_store_id, submitted_at, submitted_by, status,
      online_stores ( name ),
      online_store_catalog_submission_items ( change_type, decision )
    `
    )
    .order("submitted_at", { ascending: false });

  if (storeId !== undefined) {
    request = request.eq("online_store_id", storeId);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`Failed to load catalog submissions: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const store = firstRelated(row.online_stores);
    const items = (row.online_store_catalog_submission_items ?? []) as {
      change_type: "added" | "removed";
      decision: "pending" | "approved" | "rejected";
    }[];
    return {
      id: row.id,
      onlineStoreId: row.online_store_id,
      onlineStoreName: store?.name ?? `Store #${row.online_store_id}`,
      submittedAt: row.submitted_at,
      submittedBy: row.submitted_by,
      status: row.status,
      addedCount: items.filter((i) => i.change_type === "added").length,
      removedCount: items.filter((i) => i.change_type === "removed").length,
      pendingItemCount: items.filter((i) => i.decision === "pending").length,
    };
  });
}

// Global approval queue -- every pending/partially-approved submission
// across every store, for the staff-facing review dashboard (task
// requirement 6).
export async function listPendingCatalogSubmissions(): Promise<CatalogSubmissionListEntry[]> {
  await requireStaffSession();
  const all = await listSubmissionEntries();
  // 'partially_approved' is a TERMINAL status (every item already
  // decided, mixed outcome) -- see
  // database/migrations/20261114_add_unique_active_catalog_submission_per_store.sql.
  // Only 'pending' still has an item awaiting a decision.
  return all.filter((s) => s.status === "pending");
}

// Full submission history for one store's Approvals tab.
export async function listCatalogSubmissionsForStore(storeId: number): Promise<CatalogSubmissionListEntry[]> {
  await requireStaffSession();
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return [];
  return listSubmissionEntries(storeId);
}

// Applies one reviewer decision to one submission item (task
// requirement 6: "Support approving or rejecting individual changes
// with notes... Update the approved store catalog only after
// approval. Record reviewer and timestamps."). Delegates entirely to
// decide_catalog_submission_item() (see
// database/migrations/20261118_add_decide_catalog_submission_item_rpc.sql),
// which applies the decision, the baseline mutation (an 'added' item
// upserted in, a 'removed' item deleted out, a rejected item never
// touching the baseline), and the parent submission's recomputed
// status all in one transaction with submission-then-item row
// locking -- replacing three previously-unlocked sequential
// round-trips that a live concurrent-decision test showed could race.
//
// "already-decided" is a graceful outcome (the item was already
// decided -- by a double-click, a second open tab, or a second
// reviewer -- while this call was waiting on the lock), not an
// exception: it reports the item's and submission's CURRENT state
// rather than silently re-applying or throwing a generic error.
export async function decideCatalogSubmissionItem(
  itemId: number,
  decision: "approved" | "rejected",
  notes: string | null
): Promise<{ outcome: "applied" | "already-decided"; itemDecision: string; submissionStatus: string }> {
  const session = await requireStaffSession();
  if (!Number.isSafeInteger(itemId) || itemId <= 0) {
    throw new Error("Invalid submission item id.");
  }

  const { data, error } = await supabaseAdmin.rpc("decide_catalog_submission_item", {
    p_item_id: itemId,
    p_decision: decision,
    p_notes: notes,
    p_decided_by: session.email,
  });

  if (error) {
    throw new Error(`Failed to record decision for item ${itemId}: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error(`decide_catalog_submission_item returned no result for item ${itemId}.`);
  }

  return {
    outcome: row.outcome === "already-decided" ? "already-decided" : "applied",
    itemDecision: row.item_decision,
    submissionStatus: row.submission_status,
  };
}

// Task requirement 8: "design clear statuses... do not implement live
// Shopify product publishing yet." This function only ever updates a
// text label on a baseline row -- it never calls the Shopify API, and
// nothing in this codebase calls this function automatically; it is
// exclusively a manually-triggered staff action.
const PUBLISH_STATUSES = ["pending_decoration", "pending_mockup", "pending_pricing", "ready_to_publish", "published"] as const;

export async function setBaselinePublishStatus(
  storeId: number,
  approvedCatalogStyleId: number,
  colorName: string,
  status: (typeof PUBLISH_STATUSES)[number]
): Promise<void> {
  await requireStaffSession();
  if (!PUBLISH_STATUSES.includes(status)) {
    throw new Error(`Invalid publish status: ${status}`);
  }

  const { error } = await supabaseAdmin
    .from("online_store_catalog_baseline")
    .update({ shopify_publish_status: status })
    .eq("online_store_id", storeId)
    .eq("approved_catalog_style_id", approvedCatalogStyleId)
    .eq("color_name", colorName);

  if (error) {
    throw new Error(`Failed to update Shopify publish status: ${error.message}`);
  }
}

export async function setCatalogSubmissionReviewNotes(submissionId: number, notes: string): Promise<void> {
  await requireStaffSession();
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
    throw new Error("Invalid submission id.");
  }
  const { error } = await supabaseAdmin
    .from("online_store_catalog_submissions")
    .update({ review_notes: notes })
    .eq("id", submissionId);
  if (error) {
    throw new Error(`Failed to update review notes: ${error.message}`);
  }
}
