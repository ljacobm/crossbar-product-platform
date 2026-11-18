"use client";

import { useState } from "react";
import CatalogReviewPanel from "@/components/CatalogReviewPanel";

// Fixed bottom bar (not sticky-in-flow): shows the "N selected" count
// (task requirement "provide a clear selected-product count") and
// opens the Review screen rather than submitting directly -- the
// actual submission happens inside CatalogReviewPanel, only after the
// customer confirms what they're sending. Always a single compact row
// (no stacking at narrow widths) so it never grows tall enough to
// crowd out the page on mobile -- CatalogStyleGrid reserves bottom
// space (a fixed-height spacer after the pagination) so this can never
// cover the last row of cards or the pagination controls.
export default function CatalogSubmitBar({ token, selectedCount }: { token: string; selectedCount: number }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur-sm">
        <div
          className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-6 lg:px-10 xl:px-12"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {selectedCount > 0
                ? `${selectedCount} color${selectedCount === 1 ? "" : "s"} selected`
                : "No colors selected yet"}
            </p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              Saved automatically as you go -- nothing goes live until Crossbar Athletics approves it.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="flex-shrink-0 rounded-lg bg-[#860132] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 sm:px-5"
          >
            Review & Submit
          </button>
        </div>
      </div>

      {reviewOpen && (
        <CatalogReviewPanel
          token={token}
          onClose={() => setReviewOpen(false)}
          onSubmitted={() => setJustSubmitted(true)}
        />
      )}

      {justSubmitted && !reviewOpen && (
        <div
          className="fixed left-1/2 z-20 -translate-x-1/2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-lg"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        >
          Submitted for review!
        </div>
      )}
    </>
  );
}
