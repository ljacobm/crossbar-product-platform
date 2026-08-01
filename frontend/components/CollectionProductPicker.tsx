"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addProductToCollection,
  type CollectionActionState,
} from "@/app/collections/actions";
import WorkflowStatusBadge from "@/components/WorkflowStatusBadge";

const initialState: CollectionActionState = { error: null };

type AvailableProduct = {
  id: number;
  display_name: string;
  crossbar_sku: string;
  brand_display: string | null;
  crossbar_category: string | null;
  workflow_status: string;
  thumbnail_url: string | null;
};

function Thumbnail({ url, alt }: { url: string | null; alt: string }) {
  return (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-contain p-1" />
      ) : (
        <span className="text-lg text-slate-400">🖼️</span>
      )}
    </div>
  );
}

function AddProductButton({
  collectionId,
  productId,
  onAdded,
}: {
  collectionId: number;
  productId: number;
  onAdded: () => void;
}) {
  const addWithId = addProductToCollection.bind(null, collectionId);
  const [state, formAction, pending] = useActionState(addWithId, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      onAdded();
    }
    wasPending.current = pending;
  }, [pending, state, onAdded]);

  return (
    <form action={formAction} className="flex-shrink-0">
      <input type="hidden" name="catalog_product_id" value={productId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add to Collection"}
      </button>
      {state?.error && <p className="mt-1 max-w-[180px] text-xs text-red-700">{state.error}</p>}
    </form>
  );
}

export default function CollectionProductPicker({ collectionId }: { collectionId: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AvailableProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);

    const timeout = setTimeout(async () => {
      try {
        const searchParams = new URLSearchParams({ collectionId: String(collectionId) });
        if (query) searchParams.set("q", query);

        const response = await fetch(
          `/api/collections/product-search?${searchParams.toString()}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Search request failed.");
        }

        const data = await response.json();
        setResults(data.results || []);
        setSearchError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSearchError("Failed to search products. Please try again.");
        }
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, collectionId, refreshKey]);

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Add Products</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search Approved or Website Ready products to add to this collection.
        </p>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, Crossbar SKU, or brand…"
        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
      />

      {searchError && <p className="mt-2 text-sm text-red-700">{searchError}</p>}

      <div className="mt-4 max-h-96 overflow-y-auto rounded-lg border border-slate-200">
        {searching ? (
          <p className="px-4 py-4 text-sm text-slate-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">
            No matching Approved or Website Ready products found.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {results.map((product) => (
              <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                <Thumbnail url={product.thumbnail_url} alt={product.display_name} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {product.display_name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{product.brand_display || "No brand"}</span>
                    <span>•</span>
                    <span className="font-mono">{product.crossbar_sku}</span>
                  </p>
                </div>

                <WorkflowStatusBadge status={product.workflow_status} />

                <AddProductButton
                  collectionId={collectionId}
                  productId={product.id}
                  onAdded={() => setRefreshKey((key) => key + 1)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
