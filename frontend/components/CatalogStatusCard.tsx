"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { updateCatalogStatus, type ActionState } from "@/app/products/[id]/actions";
import { WORKFLOW_STATUSES } from "@/lib/workflowOptions";

const initialState: ActionState = { error: null };

function nearestCatalogView(status: string): string {
  if (status === "Archived") return "archived";
  if (status === "Website Ready") return "website-ready";
  if (status === "Approved") return "approved";
  return "review";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CatalogStatusCard({
  productId,
  initialStatus,
  initialWebsiteReady,
  initialTeamStoreEnabled,
  approvedBy,
  approvedAt,
  websiteReadyAt,
}: {
  productId: number;
  initialStatus: string;
  initialWebsiteReady: boolean;
  initialTeamStoreEnabled: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  websiteReadyAt: string | null;
}) {
  const updateWithId = updateCatalogStatus.bind(null, productId);
  const [state, formAction, pending] = useActionState(updateWithId, initialState);

  const [status, setStatus] = useState(initialStatus);
  const [websiteReady, setWebsiteReady] = useState(initialWebsiteReady);
  const [teamStoreEnabled, setTeamStoreEnabled] = useState(initialTeamStoreEnabled);

  function submit(nextStatus: string, nextWebsiteReady: boolean, nextTeamStoreEnabled: boolean) {
    const fd = new FormData();
    fd.set("workflow_status", nextStatus);
    if (nextWebsiteReady) fd.set("website_ready", "on");
    if (nextTeamStoreEnabled) fd.set("team_store_enabled", "on");
    startTransition(() => {
      formAction(fd);
    });
  }

  function handleStatusChange(value: string) {
    const nextWebsiteReady = value === "Website Ready" ? true : websiteReady;
    setStatus(value);
    setWebsiteReady(nextWebsiteReady);
    submit(value, nextWebsiteReady, teamStoreEnabled);
  }

  function handleWebsiteReadyChange(checked: boolean) {
    setWebsiteReady(checked);
    submit(status, checked, teamStoreEnabled);
  }

  function handleTeamStoreChange(checked: boolean) {
    setTeamStoreEnabled(checked);
    submit(status, websiteReady, checked);
  }

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Catalog Status</h2>
        <div className="flex items-center gap-3">
          {pending && <span className="text-xs text-slate-400">Saving…</span>}
          <Link
            href={`/products?view=${nearestCatalogView(status)}`}
            className="text-sm font-medium text-[#860132] hover:underline"
          >
            View in Catalog Manager
          </Link>
        </div>
      </div>

      {state.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Workflow Status
          </label>
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm"
          >
            {WORKFLOW_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col justify-end gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={websiteReady}
              onChange={(e) => handleWebsiteReadyChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Website Ready
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={teamStoreEnabled}
              onChange={(e) => handleTeamStoreChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Available for Team Stores
          </label>
        </div>

        <div>
          <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Approved By
          </dt>
          <dd className="mt-2 text-sm text-slate-900">{approvedBy || "—"}</dd>
        </div>

        <div>
          <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Approved Date
          </dt>
          <dd className="mt-2 text-sm text-slate-900">{formatDate(approvedAt)}</dd>
        </div>
      </div>

      {websiteReadyAt && (
        <p className="mt-4 text-xs text-slate-400">
          Marked website ready on {formatDate(websiteReadyAt)}.
        </p>
      )}
    </div>
  );
}
