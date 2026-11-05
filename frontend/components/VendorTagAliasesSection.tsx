"use client";

import { useState, useTransition } from "react";
import {
  addVendorTagAlias,
  removeVendorTagAlias,
  getVendorTagAliases,
  type VendorTagAlias,
} from "@/lib/onlineStoreVendorTagAliases";

// Staff-only "Shopify Vendor Tags" section for the Online Store Overview
// page. Shows the primary tag (read-only here -- it's still edited, if
// at all, elsewhere; this section only manages ADDITIONAL aliases) and
// every alias currently mapped to this store, with who added it and
// when. Mirrors components/PortalLinkSection.tsx's structure
// (useTransition, not useActionState -- these Server Actions take plain
// arguments and return a result for programmatic use, not a
// (prevState, formData) pair).
//
// Adding or removing an alias here only changes which Shopify Vendor
// tags match THIS store for FUTURE orders -- it never touches any
// already-ingested line item. A newly added alias does not retroactively
// associate historical orders; that is a separate, explicit reconciliation
// step (see database/reconciliation/20261105_iroquoisfh_vendor_tag_alias.sql
// for the first example) run directly against the database, not from this
// UI.
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function VendorTagAliasesSection({
  storeId,
  primaryTag,
  initialAliases,
  loadFailed = false,
}: {
  storeId: number;
  primaryTag: string | null;
  initialAliases: VendorTagAlias[];
  // True when the page's initial server-side fetch of this store's
  // aliases failed (see app/(internal)/stores/[storeId]/overview/page.tsx)
  // -- initialAliases is always [] in that case, but that must never be
  // shown as "No aliases yet.": that phrase means something confirmed,
  // and showing it after a failed lookup could lead staff to add a
  // duplicate of an alias that actually already exists.
  loadFailed?: boolean;
}) {
  const [aliases, setAliases] = useState<VendorTagAlias[]>(initialAliases);
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(loadFailed);
  const [isPending, startTransition] = useTransition();

  function runRetryLoad() {
    setError(null);
    startTransition(async () => {
      try {
        setAliases(await getVendorTagAliases(storeId));
        setLoadError(false);
      } catch {
        setLoadError(true);
      }
    });
  }

  function runAdd() {
    const tagToAdd = newTag;
    setError(null);
    startTransition(async () => {
      const result = await addVendorTagAlias(storeId, tagToAdd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewTag("");
      setAliases(await getVendorTagAliases(storeId));
    });
  }

  function runRemove(aliasId: number) {
    setError(null);
    startTransition(async () => {
      const result = await removeVendorTagAlias(storeId, aliasId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAliases(await getVendorTagAliases(storeId));
    });
  }

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold">Shopify Vendor Tags</h2>
      <p className="mt-1 text-sm text-slate-500">
        Shopify order line items whose Vendor tag matches the primary tag or any alias below are
        associated with this store. Adding or removing an alias only affects future orders -- it
        never changes line items already associated with a store.
      </p>

      <dl className="mt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Primary Tag</dt>
          <dd className="font-mono font-medium text-slate-900">{primaryTag || "-"}</dd>
        </div>
      </dl>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loadError && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Couldn&apos;t load this store&apos;s aliases right now -- the list below may be incomplete.</span>
          <button
            type="button"
            onClick={runRetryLoad}
            disabled={isPending}
            className="flex-shrink-0 font-medium underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Aliases ({aliases.length})
        </p>

        {aliases.length === 0 ? (
          <p className="text-sm text-slate-400">
            {loadError ? "Unable to determine aliases right now." : "No aliases yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {aliases.map((alias) => (
              <li
                key={alias.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <span className="font-mono text-sm text-slate-900">{alias.tag}</span>
                  {alias.createdBy && (
                    <span className="ml-2 text-xs text-slate-400">
                      added by {alias.createdBy} on {formatDateTime(alias.createdAt)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => runRemove(alias.id)}
                  disabled={isPending}
                  className="flex-shrink-0 text-xs font-medium text-red-700 hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="e.g. IroquoisFH"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={runAdd}
          disabled={isPending || !newTag.trim()}
          className="flex-shrink-0 rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add Alias"}
        </button>
      </div>
    </div>
  );
}
