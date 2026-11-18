"use client";

import { useState, useTransition } from "react";
import { decideItemAction } from "@/app/(internal)/stores/[storeId]/approvals/actions";
import type { CatalogSubmissionItem } from "@/lib/onlineStoreCatalogTypes";

export default function CatalogSubmissionItemRow({
  storeId,
  submissionId,
  item,
}: {
  storeId: number;
  submissionId: number;
  item: CatalogSubmissionItem;
}) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(item.decisionNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function decide(decision: "approved" | "rejected") {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await decideItemAction(storeId, submissionId, item.id, decision, notes);
      if (result.error) setError(result.error);
      if (result.notice) setNotice(result.notice);
    });
  }

  return (
    <li className="flex flex-col gap-2 border-b border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-slate-900">
          <span
            className={`mr-2 rounded px-2 py-0.5 text-xs font-semibold ${
              item.changeType === "added" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {item.changeType === "added" ? "+ Add" : "- Remove"}
          </span>
          {item.displayName} -- {item.colorName}
        </p>
        {item.decision !== "pending" && (
          <p className="mt-1 text-xs text-slate-500">
            {item.decision === "approved" ? "Approved" : "Rejected"}
            {item.decidedBy ? ` by ${item.decidedBy}` : ""}
            {item.decidedAt ? ` on ${new Date(item.decidedAt).toLocaleString()}` : ""}
            {item.decisionNotes ? ` -- "${item.decisionNotes}"` : ""}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {notice && <p className="mt-1 text-xs text-amber-600">{notice}</p>}
      </div>

      {item.decision === "pending" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => decide("approved")}
              className="rounded-lg bg-[#860132] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => decide("rejected")}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
