"use server";

import { revalidatePath } from "next/cache";
import { decideCatalogSubmissionItem } from "@/lib/onlineStoreCatalogBuilderData";

export type DecisionActionState = { error: string | null; notice: string | null };

export async function decideItemAction(
  storeId: number,
  submissionId: number,
  itemId: number,
  decision: "approved" | "rejected",
  notes: string
): Promise<DecisionActionState> {
  let notice: string | null = null;
  try {
    const result = await decideCatalogSubmissionItem(itemId, decision, notes.trim() || null);
    if (result.outcome === "already-decided") {
      // Not an error: someone else (a double-click, a second open tab,
      // or another reviewer) already decided this item. Refresh the
      // page's data rather than showing a generic failure.
      notice = `This item was already decided (${result.itemDecision}) by another reviewer -- showing the current state.`;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record decision.", notice: null };
  }

  revalidatePath(`/stores/${storeId}/approvals/${submissionId}`);
  revalidatePath(`/stores/${storeId}/approvals`);
  revalidatePath(`/stores/${storeId}/catalog`);
  revalidatePath("/approvals");
  return { error: null, notice };
}
