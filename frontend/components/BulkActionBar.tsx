"use client";

import { useState, useTransition } from "react";
import {
  bulkArchiveProducts,
  bulkSetTeamStoreEnabled,
  bulkUpdateWorkflowStatus,
} from "@/app/products/catalog-actions";
import type { BulkActionState } from "@/app/products/catalog-actions";

export default function BulkActionBar({
  selectedIds,
  onDone,
}: {
  selectedIds: number[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  function run(action: () => Promise<BulkActionState>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  function handleArchive() {
    setConfirmArchive(false);
    run(() => bulkArchiveProducts(selectedIds));
  }

  return (
    <div className="sticky top-0 z-20 mb-4 rounded-xl border border-slate-300 bg-white p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">
          {selectedIds.length} product{selectedIds.length === 1 ? "" : "s"} selected
        </span>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => bulkUpdateWorkflowStatus(selectedIds, "Reviewing"))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Mark Reviewing
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => bulkUpdateWorkflowStatus(selectedIds, "Approved"))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Approve
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => bulkUpdateWorkflowStatus(selectedIds, "Website Ready"))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Mark Website Ready
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => bulkSetTeamStoreEnabled(selectedIds, true))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Enable for Team Stores
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => bulkSetTeamStoreEnabled(selectedIds, false))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Disable for Team Stores
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmArchive(true)}
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Archive
          </button>
        </div>
      </div>

      {isPending && <p className="mt-2 text-xs text-slate-400">Applying changes…</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {confirmArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Archive {selectedIds.length} product{selectedIds.length === 1 ? "" : "s"}?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              This sets them inactive and marks their workflow status as Archived. You can
              restore them later from the product workspace.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchive}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
