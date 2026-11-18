"use client";

import { useState, useTransition } from "react";
import {
  generateCatalogAccessLink,
  regenerateCatalogAccessLink,
  revokeCatalogAccessLink,
  type CatalogLinkActionState,
  type CatalogLinkStatus,
} from "@/app/(internal)/stores/[storeId]/catalogAccessActions";

// Staff-only customer catalog link management -- mirrors
// components/PortalLinkSection.tsx's useTransition pattern, without
// the later encrypted-retrievable-copy feature (out of scope for this
// phase): the raw link is shown exactly once, right after generating
// or regenerating it, and never again after this component unmounts or
// the page is refreshed. Component state only -- never written to
// localStorage/sessionStorage/a cookie.

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CatalogAccessLinkSection({
  storeId,
  initialStatus,
}: {
  storeId: number;
  initialStatus: CatalogLinkStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rawLink, setRawLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"regenerate" | "disable" | null>(null);

  const { enabled, createdAt, lastAccessedAt, accessCount } = initialStatus;

  function handleResult(result: CatalogLinkActionState) {
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    if (result.url) {
      setRawLink(result.url);
      setCopied(false);
    }
  }

  function runGenerate() {
    setError(null);
    startTransition(async () => handleResult(await generateCatalogAccessLink(storeId)));
  }

  function runRegenerate() {
    setConfirmAction(null);
    setError(null);
    startTransition(async () => handleResult(await regenerateCatalogAccessLink(storeId)));
  }

  function runRevoke() {
    setConfirmAction(null);
    setError(null);
    startTransition(async () => handleResult(await revokeCatalogAccessLink(storeId)));
  }

  async function handleCopy() {
    if (!rawLink) return;
    try {
      await navigator.clipboard.writeText(rawLink);
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically -- select and copy the link text manually.");
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Customer Catalog Access</h2>
          <p className="mt-1 text-sm text-slate-500">
            A link for this store&apos;s customers to browse the approved catalog and select products.
          </p>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {enabled && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="font-medium text-slate-900">{createdAt ? formatDateTime(createdAt) : "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Last Accessed</dt>
            <dd className="font-medium text-slate-900">{lastAccessedAt ? formatDateTime(lastAccessedAt) : "Never"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Access Count</dt>
            <dd className="font-medium text-slate-900">{accessCount}</dd>
          </div>
        </dl>
      )}

      {rawLink && (
        <div className="mt-4 rounded-lg border border-[#860132]/30 bg-[#860132]/5 p-4">
          <p className="text-sm font-medium text-slate-900">Copy this link now -- it won&apos;t be shown again.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              value={rawLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-700"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex-shrink-0 rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
          <button type="button" onClick={() => setRawLink(null)} className="mt-2 text-xs text-slate-500 underline hover:text-slate-700">
            Hide
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!enabled ? (
          <button
            type="button"
            onClick={runGenerate}
            disabled={isPending}
            className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Generating..." : "Generate Link"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirmAction("regenerate")}
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Regenerate Link
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("disable")}
              disabled={isPending}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Disable Link
            </button>
          </>
        )}
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {confirmAction === "regenerate" ? "Regenerate catalog link?" : "Disable catalog link?"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirmAction === "regenerate"
                ? "The current link will stop working immediately, and a new one will replace it."
                : "The current link will stop working immediately. Customers will no longer be able to access this store's catalog until a new link is generated."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={isPending}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAction === "regenerate" ? runRegenerate : runRevoke}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Working..." : confirmAction === "regenerate" ? "Regenerate" : "Disable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
