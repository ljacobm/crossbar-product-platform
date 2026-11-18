"use client";

import { useActionState } from "react";
import { importStylesAction, type ImportActionState } from "@/app/(internal)/catalog/approved-styles/actions";

export default function ApprovedStyleImportForm() {
  const [state, formAction, isPending] = useActionState<ImportActionState, FormData>(importStylesAction, {
    report: null,
    error: null,
  });

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold">Bulk Import Style Codes</h2>
      <p className="mt-1 text-sm text-slate-500">
        Paste SanMar style/item codes -- one per line, or separated by commas/semicolons. Each is
        trimmed, deduplicated, and matched exactly against the existing catalog.
      </p>

      <form action={formAction} className="mt-4">
        <textarea
          name="codes"
          rows={6}
          placeholder={"PC54\nDT6000\nST350"}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="mt-3 rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Importing..." : "Import"}
        </button>
      </form>

      {state.error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      {state.report && (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-medium text-green-700">Added {state.report.added.length} new style(s).</p>
          {state.report.added.length > 0 && <p className="text-slate-600">{state.report.added.join(", ")}</p>}

          {state.report.alreadyApproved.length > 0 && (
            <div>
              <p className="font-medium text-slate-700">
                Already approved ({state.report.alreadyApproved.length}):
              </p>
              <p className="text-slate-600">{state.report.alreadyApproved.join(", ")}</p>
            </div>
          )}

          {state.report.unmatched.length > 0 && (
            <div>
              <p className="font-medium text-red-700">
                Unmatched -- no exact style match found ({state.report.unmatched.length}):
              </p>
              <p className="text-slate-600">{state.report.unmatched.join(", ")}</p>
            </div>
          )}

          {state.report.duplicatesRemoved.length > 0 && (
            <div>
              <p className="font-medium text-slate-700">
                Duplicates in your pasted list ({state.report.duplicatesRemoved.length}):
              </p>
              <p className="text-slate-600">{state.report.duplicatesRemoved.join(", ")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
