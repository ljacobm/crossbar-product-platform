"use server";

import { revalidatePath } from "next/cache";
import { bulkImportApprovedCatalogStyles } from "@/lib/approvedCatalogStyleData";
import type { ApprovedCatalogStyleImportReport } from "@/lib/approvedCatalogStyleTypes";

// This file's own route (app/(internal)/catalog/approved-styles/page.tsx)
// now just redirects to /products?view=team-store-ready, where
// components/ApprovedStyleImportForm.tsx (the only importer of this
// action) is actually rendered -- see that page for the Online Store
// Builder integration. Kept at this path rather than moved: it's a
// plain server-action module, not a route itself, and moving it would
// only add risk (updating the one import site) for no behavioral
// benefit.

export type ImportActionState = { report: ApprovedCatalogStyleImportReport | null; error: string | null };

export async function importStylesAction(
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const raw = String(formData.get("codes") ?? "");
  if (!raw.trim()) {
    return { report: null, error: "Paste at least one style code." };
  }

  try {
    const report = await bulkImportApprovedCatalogStyles(raw);
    revalidatePath("/products");
    return { report, error: null };
  } catch (err) {
    return { report: null, error: err instanceof Error ? err.message : "Import failed." };
  }
}
