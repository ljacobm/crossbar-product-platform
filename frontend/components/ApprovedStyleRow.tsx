"use client";

import { useState, useTransition } from "react";
import { setApprovedCatalogStyleActive, removeOrDeactivateApprovedCatalogStyle } from "@/lib/approvedCatalogStyleData";
import type { ApprovedCatalogStyle } from "@/lib/approvedCatalogStyleTypes";

export default function ApprovedStyleRow({ style }: { style: ApprovedCatalogStyle }) {
  const [isPending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removed, setRemoved] = useState(false);
  // Set only when removeOrDeactivateApprovedCatalogStyle() had to fall
  // back to deactivating instead of deleting -- see that function's
  // own comment for why (this style is already referenced by a
  // store's draft/baseline/submission history, so a hard delete would
  // silently cascade-delete it).
  const [deactivatedInstead, setDeactivatedInstead] = useState(false);
  const isActive = deactivatedInstead ? false : style.active;

  if (removed) return null;

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 font-mono text-xs text-slate-700">{style.styleCode}</td>
      <td className="py-2 font-medium text-slate-900">{style.displayName ?? "-"}</td>
      <td className="py-2 text-slate-500">{style.brandDisplay ?? "-"}</td>
      <td className="py-2 text-slate-500">{style.crossbarCategory ?? "-"}</td>
      <td className="py-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => setApprovedCatalogStyleActive(style.id, !isActive))}
          className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
            isActive ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {isActive ? "Active" : "Disabled"}
        </button>
        {deactivatedInstead && (
          <p className="mt-1 text-[11px] text-amber-700">
            Already in use by a store -- deactivated instead of removed, to protect its history.
          </p>
        )}
      </td>
      <td className="py-2 text-right">
        {confirmRemove ? (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeOrDeactivateApprovedCatalogStyle(style.id);
                  setConfirmRemove(false);
                  if (result.action === "deleted") {
                    setRemoved(true);
                  } else {
                    setDeactivatedInstead(true);
                  }
                })
              }
              className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            title="Deletes this entry entirely if no store has ever used it; otherwise safely deactivates it instead."
            className="text-xs text-red-600 underline hover:text-red-800"
          >
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}
