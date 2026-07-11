"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  linkExistingResource,
  type ResourceActionState,
} from "@/app/products/[id]/resources/actions";
import { RESOURCE_TYPES, RESOURCE_TYPE_ICONS } from "@/lib/resourceOptions";

const initialState: ResourceActionState = { error: null };

type AvailableResource = {
  id: number;
  resource_type: string;
  title: string;
  summary: string | null;
  version: string | null;
  status: string;
  file_url: string | null;
  external_url: string | null;
  active: boolean;
};

function AddResourceButton({
  productId,
  resourceId,
  onLinked,
}: {
  productId: number;
  resourceId: number;
  onLinked: () => void;
}) {
  const linkWithId = linkExistingResource.bind(null, productId);
  const [state, formAction, pending] = useActionState(linkWithId, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      onLinked();
    }
    wasPending.current = pending;
  }, [pending, state, onLinked]);

  return (
    <form action={formAction} className="flex-shrink-0">
      <input type="hidden" name="resource_id" value={resourceId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add to Product"}
      </button>
      {state?.error && <p className="mt-1 max-w-[160px] text-xs text-red-700">{state.error}</p>}
    </form>
  );
}

export default function AvailableResourcesPicker({ productId }: { productId: number }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState<AvailableResource[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);

    const timeout = setTimeout(async () => {
      try {
        const searchParams = new URLSearchParams({ productId: String(productId) });
        if (query) searchParams.set("q", query);
        if (type) searchParams.set("type", type);

        const response = await fetch(`/api/resources/search?${searchParams.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Search request failed.");
        }

        const data = await response.json();
        setResults(data.results || []);
        setSearchError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSearchError("Failed to search resources. Please try again.");
        }
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, type, productId, refreshKey]);

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Available Resources</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search existing resources to reuse on this product.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, summary, or type…"
          className="rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-300 px-4 py-3 text-sm"
        >
          <option value="">All Types</option>
          {RESOURCE_TYPES.map((resourceType) => (
            <option key={resourceType} value={resourceType}>
              {resourceType}
            </option>
          ))}
        </select>
      </div>

      {searchError && <p className="mt-2 text-sm text-red-700">{searchError}</p>}

      <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-slate-200">
        {searching ? (
          <p className="px-4 py-4 text-sm text-slate-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">No matching resources found.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {results.map((resource) => (
              <li key={resource.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">
                  {RESOURCE_TYPE_ICONS[resource.resource_type] || "📁"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {resource.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{resource.resource_type}</span>
                    {resource.version && (
                      <>
                        <span>•</span>
                        <span>v{resource.version}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{resource.status}</span>
                  </p>
                </div>

                <AddResourceButton
                  productId={productId}
                  resourceId={resource.id}
                  onLinked={() => setRefreshKey((key) => key + 1)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
