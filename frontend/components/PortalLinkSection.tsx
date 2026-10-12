"use client";

import { useState, useTransition } from "react";
import {
  generatePortalLink,
  regeneratePortalLink,
  revokePortalLink,
  getActivePortalLink,
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
//
// Phase 4D, Slice 4B: the active link is now persistently retrievable,
// not just shown once at creation time -- getActivePortalLink() (same
// file as the other actions) does the actual retrieval, staff-session-
// gated and re-run on every click, never cached here or anywhere
// client-side. The masked row below is shown whenever a link is active
// (initialStatus.enabled); clicking "Copy Active Link" is what reveals
// and copies the real value -- the masked placeholder itself is a fixed
// string, never derived from the real link or its length. If the active
// link predates encrypted-copy support (initialStatus.canRetrieve is
// false), the button stays disabled with an explanatory tooltip instead
// of ever attempting a retrieval that can only fail.

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
  // Distinguishes "just generated/regenerated -- this is the one-time
  // display" from "retrieved on demand via Copy Active Link" purely for
  // the messaging shown alongside rawLink below -- both reuse the same
  // rawLink/copied state since they're mutually exclusive in time (only
  // one reveal is ever shown at once) and neither is ever persisted
  // beyond this component's state.
  const [justGenerated, setJustGenerated] = useState(false);

  const { enabled, createdAt, lastAccessedAt, accessCount, canRetrieve } = initialStatus;

  // Mirrors the two banners above into a single tooltip string -- never
  // names the configured pilot store, only states that this one isn't
  // it.
  const generateDisabledTitle = !generationEnabled
    ? "Disabled until the customer portal page is deployed."
    : !pilotEligible
    ? "Disabled -- this store is not part of the current pilot."
    : undefined;

  const retrieveDisabledTitle = !canRetrieve
    ? "This link was created before persistent retrieval was enabled -- regenerate it to enable copying it again."
    : undefined;

  function handleResult(result: PortalLinkActionState) {
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    if (result.url) {
      setJustGenerated(true);
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

  // Retrieves and copies the current active link on demand -- a fresh
  // server round-trip every time (requireStaffSession() + decrypt
  // inside getActivePortalLink()), never a cached or client-stored
  // value, so this works identically after a refresh, a logout/login,
  // or from a different staff session entirely.
  function runRetrieve() {
    setError(null);
    setJustGenerated(false);
    startTransition(async () => {
      const result = await getActivePortalLink(storeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.url) return;

      setRawLink(result.url);
      setCopied(false);
      try {
        await navigator.clipboard.writeText(result.url);
        setCopied(true);
      } catch {
        // Clipboard write can fail (permissions, insecure context,
        // etc.) -- the link is still revealed below for manual
        // select-and-copy, same fallback as handleCopy().
      }
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

      {enabled && !rawLink && (
        <div className="mt-4">
          <p className="mb-1 text-xs text-slate-500">Active link</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              // A fixed-width placeholder, never derived from the real
              // link or its length -- masked by default, per the
              // retrieval design, until Copy Active Link is clicked.
              value="•••••••••••••••••••••••••••••••••••••••••••"
              aria-label="Active portal link (hidden)"
              className="min-w-0 flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-400"
            />
            <button
              type="button"
              onClick={runRetrieve}
              disabled={isPending || !canRetrieve}
              title={retrieveDisabledTitle}
              className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy Active Link
            </button>
          </div>
          {!canRetrieve && (
            <p className="mt-1 text-xs text-slate-500">{retrieveDisabledTitle}</p>
          )}
        </div>
      )}

      {rawLink && (
        <div className="mt-4 rounded-lg border border-[#860132]/30 bg-[#860132]/5 p-4">
          <p className="text-sm font-medium text-slate-900">
            {justGenerated ? "Copy this link now." : "This is the current active link."}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {justGenerated
              ? "You can retrieve and copy this same link again at any time using Copy Active Link, below -- it isn't shown here only once."
              : "You can retrieve this same link again at any time by clicking Copy Active Link."}
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
            Hide
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
