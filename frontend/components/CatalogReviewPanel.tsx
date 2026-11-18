"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getCustomerDraftSummary,
  getCustomerSubmissionStatus,
  submitCustomerCatalogForReview,
} from "@/lib/onlineStoreCatalogCustomerData";
import type { CatalogDraftSummaryItem, CatalogSubmissionStatusItem } from "@/lib/onlineStoreCatalogTypes";

// "Provide a review screen showing selected products and colors.
// Require explicit submission for Crossbar approval." Fetches the
// FULL current draft (every selected style/color, regardless of which
// browse page/filter it was picked from) AND the customer's submission
// history on demand -- only when this panel actually opens, never on
// every catalog page load.
//
// Task 1 ("customer submission visibility"): the draft list below
// ("Your Current Selections") and the submission status list
// ("Submission Status") are two separate sections on purpose -- the
// draft is live/editable state (via CatalogProductModal elsewhere),
// while submission status is a read-only history of what was actually
// submitted and decided. Conflating them in one list would blur
// exactly the distinction the task asked for.

// Only ever rendered by the parent while open (see
// components/CatalogSubmitBar.tsx's conditional `{reviewOpen && <CatalogReviewPanel .../>}`)
// -- so a fresh mount is exactly "the panel just opened," and this
// effect only ever needs to run once per mount (empty deps), fetching
// directly rather than first synchronously resetting state and then
// fetching. Closing and reopening unmounts/remounts this component,
// which is exactly the desired behavior: always show the CURRENT
// draft, never a stale fetch from a previous time it was open.
export default function CatalogReviewPanel({
  token,
  onClose,
  onSubmitted,
}: {
  token: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [items, setItems] = useState<CatalogDraftSummaryItem[] | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<CatalogSubmissionStatusItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitResult, setSubmitResult] = useState<
    "submitted" | "nothing-to-submit" | "already-pending" | "error" | null
  >(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const [summary, status] = await Promise.all([
        getCustomerDraftSummary(token),
        getCustomerSubmissionStatus(token),
      ]);
      if (!summary || !status) {
        setLoadError("Couldn't load your current selections. Please try again.");
        return;
      }
      setItems(summary);
      setSubmissionStatus(status);
    });
  }, [token]);

  const grouped = new Map<number, { styleCode: string; displayName: string; brandDisplay: string | null; colors: string[] }>();
  for (const item of items ?? []) {
    if (!grouped.has(item.approvedCatalogStyleId)) {
      grouped.set(item.approvedCatalogStyleId, {
        styleCode: item.styleCode,
        displayName: item.displayName,
        brandDisplay: item.brandDisplay,
        colors: [],
      });
    }
    grouped.get(item.approvedCatalogStyleId)!.colors.push(item.colorName);
  }

  function handleSubmit() {
    setSubmitResult(null);
    startTransition(async () => {
      try {
        const outcome = await submitCustomerCatalogForReview(token, name);
        if (!outcome) {
          setSubmitResult("error");
          return;
        }
        setSubmitResult(outcome.outcome);
        if (outcome.outcome === "submitted") {
          onSubmitted();
          const status = await getCustomerSubmissionStatus(token);
          if (status) setSubmissionStatus(status);
        }
      } catch {
        setSubmitResult("error");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-4 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Review Your Selections</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        {loadError && <p className="mt-4 text-sm text-red-600">{loadError}</p>}

        {!items && !loadError && <p className="mt-4 text-sm text-slate-500">Loading your selections...</p>}

        {items && (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Your Current Selections</h3>
            {items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">You haven&apos;t selected anything yet.</p>
            ) : (
              <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto">
                {Array.from(grouped.entries()).map(([styleId, group]) => (
                  <li key={styleId} className="py-3">
                    <p className="font-medium text-slate-900">
                      {group.displayName} <span className="font-mono text-xs text-slate-400">#{group.styleCode}</span>
                    </p>
                    <p className="text-xs text-slate-500">{group.brandDisplay ?? "—"}</p>
                    <p className="mt-1 text-sm text-slate-700">Colors: {group.colors.join(", ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {submissionStatus && submissionStatus.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Submission Status</h3>
            <p className="mt-1 text-xs text-slate-500">
              What Crossbar has decided on changes you&apos;ve already submitted. This updates only after you submit
              again -- it does not change as you edit your current selections above.
            </p>
            <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto">
              {submissionStatus.map((s) => (
                <li key={`${s.approvedCatalogStyleId}:${s.colorName}:${s.changeType}`} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-900">
                      <span
                        className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          s.changeType === "added" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {s.changeType === "added" ? "+ Add" : "- Remove"}
                      </span>
                      {s.displayName} -- {s.colorName}
                    </p>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        s.decision === "approved"
                          ? "bg-green-50 text-green-700"
                          : s.decision === "rejected"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {s.decision === "approved" ? "Approved" : s.decision === "rejected" ? "Rejected" : "Pending review"}
                    </span>
                  </div>
                  {s.decision === "rejected" && s.decisionNotes && (
                    <p className="mt-1 text-xs text-slate-500">Crossbar&apos;s note: &quot;{s.decisionNotes}&quot;</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {submitResult === "submitted" && (
          <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            Submitted for Crossbar review. Thank you!
          </p>
        )}
        {submitResult === "nothing-to-submit" && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            No changes to submit right now -- your selections already match what&apos;s approved.
          </p>
        )}
        {submitResult === "already-pending" && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            You already have a submission awaiting Crossbar&apos;s review. Please wait for that to be decided before
            submitting again.
          </p>
        )}
        {submitResult === "error" && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            Something went wrong -- please try again.
          </p>
        )}

        {items && items.length > 0 && submitResult !== "submitted" && (
          <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="rounded-lg bg-[#860132] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Submitting..." : "Confirm & Submit for Approval"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
