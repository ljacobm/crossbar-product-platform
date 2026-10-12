"use client";

import { useState, useTransition } from "react";
import {
  generatePortalLink,
  regeneratePortalLink,
  revokePortalLink,
  type PortalLinkActionState,
} from "@/app/(internal)/stores/[storeId]/actions";
import type { PortalLinkStatus } from "@/lib/onlineStorePortalData";

// Phase 4D, Slice 2: staff-only portal link management UI. Calls the
// Slice 1 Server Actions directly (useTransition, not useActionState) --
// generatePortalLink/regeneratePortalLink/revokePortalLink take a plain
// storeId and return a result for programmatic use, not a
// (prevState, formData) pair, so they don't fit the
// useActionState-plus-.bind() pattern used elsewhere in this app
// (DeleteCollectionButton, DeleteImageModal). useTransition's isPending
// still gives the same "disable buttons while a request is in flight"
// behavior those components get from useActionState's pending flag.
//
// IMPORTANT: the customer-facing /portal/[token] route is feature-flagged
// off, and Slice 4A adds a second, narrower gate -- a single pilot store,
// configured server-side (PORTAL_PILOT_STORE_ID). The `generationEnabled`
// and `pilotEligible` props (both computed server-side in
// lib/portalFeatureFlag.ts and passed down from the Overview page)
// disable the Generate/Regenerate buttons here purely for a clear,
// non-confusing staff experience -- this client-side disable is NOT the
// actual security control. The real enforcement is the same two checks
// run again, server side, inside generatePortalLink/regeneratePortalLink
// themselves (app/(internal)/stores/[storeId]/actions.ts) and inside the
// customer data-serving path (lib/customerPortalSalesData.ts), after
// requireStaffSession() (staff side) or token resolution (customer side)
// and before any token is generated or any sales/payout data is queried
// -- a disabled button alone would never stop someone from invoking the
// underlying Server Action directly. Revoking an existing link is never
// gated by either flag: there's no harm in disabling a link regardless
// of the portal's deployment or pilot state, only in minting a new one
// nobody can use yet, or one outside the pilot.
//
// pilotEligible being true already implies generationEnabled is true too
// (isStoreAllowedForPilot() checks both) -- generationEnabled is kept as
// a separate prop purely so this component can show the right message
// for the right reason: "the whole feature is off" reads differently
// from "the feature is on, but not for this store," and conflating them
// into one boolean would lose that distinction for staff troubleshooting
// a specific store.

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PortalLinkSection({
  storeId,
  initialStatus,
  generationEnabled,
  pilotEligible,
}: {
  storeId: number;
  initialStatus: PortalLinkStatus;
  generationEnabled: boolean;
  pilotEligible: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The raw link lives only here -- component state, never written to
  // localStorage/sessionStorage/a cookie/any persistent store. It is
  // cleared on dismiss and lost entirely on refresh or navigation, by
  // design: this is the one and only time the app ever holds the raw
  // token anywhere outside the staff member's own clipboard.
  const [rawLink, setRawLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"regenerate" | "disable" | null>(null);

  const { enabled, createdAt, lastAccessedAt, accessCount } = initialStatus;

  // Mirrors the two banners above into a single tooltip string -- never
  // names the configured pilot store, only states that this one isn't
  // it.
  const generateDisabledTitle = !generationEnabled
    ? "Disabled until the customer portal page is deployed."
    : !pilotEligible
    ? "Disabled -- this store is not part of the current pilot."
    : undefined;

  function handleResult(result: PortalLinkActionState) {
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
    startTransition(async () => {
      const result = await generatePortalLink(storeId);
      handleResult(result);
    });
  }

  function runRegenerate() {
    setConfirmAction(null);
    setError(null);
    startTransition(async () => {
      const result = await regeneratePortalLink(storeId);
      handleResult(result);
    });
  }

  function runRevoke() {
    setConfirmAction(null);
    setError(null);
    startTransition(async () => {
      const result = await revokePortalLink(storeId);
      handleResult(result);
    });
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
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Customer Portal</h2>
          <p className="mt-1 text-sm text-slate-500">
            A read-only link for this store&apos;s fundraiser organizer to view sales and payouts.
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

      {!generationEnabled && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The customer portal page hasn&apos;t been deployed yet. Link generation is disabled
          until it&apos;s live -- generating a link now would produce a URL nothing can serve.
        </p>
      )}

      {generationEnabled && !pilotEligible && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This store is not part of the current customer portal pilot. Link generation is
          disabled for this store.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {enabled && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="font-medium text-slate-900">
              {createdAt ? formatDateTime(createdAt) : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Last Accessed</dt>
            <dd className="font-medium text-slate-900">
              {lastAccessedAt ? formatDateTime(lastAccessedAt) : "Never"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Access Count</dt>
            <dd className="font-medium text-slate-900">{accessCount}</dd>
          </div>
        </dl>
      )}

      {rawLink && (
        <div className="mt-4 rounded-lg border border-[#860132]/30 bg-[#860132]/5 p-4">
          <p className="text-sm font-medium text-slate-900">
            Copy this link now -- it won&apos;t be shown again.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            This is the only time the full link is displayed. If it&apos;s lost, you&apos;ll
            need to regenerate a new one, which invalidates this one.
          </p>

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

          <button
            type="button"
            onClick={() => setRawLink(null)}
            className="mt-2 text-xs text-slate-500 underline hover:text-slate-700"
          >
            I&apos;ve copied it -- dismiss
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!enabled ? (
          <button
            type="button"
            onClick={runGenerate}
            disabled={isPending || !pilotEligible}
            title={generateDisabledTitle}
            className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Generating..." : "Generate Link"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirmAction("regenerate")}
              disabled={isPending || !pilotEligible}
              title={generateDisabledTitle}
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
              {confirmAction === "regenerate" ? "Regenerate portal link?" : "Disable portal link?"}
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              {confirmAction === "regenerate"
                ? "The current link will stop working immediately, and a new one will replace it. Anyone still using the old link will no longer be able to access this store's portal."
                : "The current link will stop working immediately. The fundraiser organizer will no longer be able to view this store's sales or payouts until a new link is generated."}
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
                {isPending
                  ? "Working..."
                  : confirmAction === "regenerate"
                  ? "Regenerate"
                  : "Disable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
