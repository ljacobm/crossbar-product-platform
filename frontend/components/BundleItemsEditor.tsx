"use client";

import { useEffect, useState } from "react";

export type BundleSearchResult = {
  id: number;
  display_name: string;
  crossbar_sku: string;
  brand_display: string | null;
  crossbar_category: string | null;
  source_type: string;
  active: boolean;
  thumbnail_url: string | null;
};

export type BundleSelectedItem = BundleSearchResult & {
  quantity: number;
  required: boolean;
};

function SourceBadge({ sourceType }: { sourceType: string }) {
  const isCrossbar = sourceType === "crossbar";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        isCrossbar ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"
      }`}
    >
      {isCrossbar ? "Crossbar" : "Imported"}
    </span>
  );
}

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

export default function BundleItemsEditor({
  name = "items_json",
  initialItems = [],
}: {
  name?: string;
  initialItems?: BundleSelectedItem[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BundleSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<BundleSelectedItem[]>(initialItems);

  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/products/search?q=${encodeURIComponent(query)}`,
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
  }, [query]);

  function addItem(product: BundleSearchResult) {
    setSelectedItems((current) => {
      if (current.some((item) => item.id === product.id)) {
        return current;
      }

      return [...current, { ...product, quantity: 1, required: true }];
    });
  }

  function removeItem(id: number) {
    setSelectedItems((current) => current.filter((item) => item.id !== id));
  }

  function updateQuantity(id: number, quantity: number) {
    setSelectedItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item
      )
    );
  }

  function updateRequired(id: number, required: boolean) {
    setSelectedItems((current) =>
      current.map((item) => (item.id === id ? { ...item, required } : item))
    );
  }

  const itemsJson = JSON.stringify(
    selectedItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      required: item.required,
    }))
  );

  const totalUnits = selectedItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div>
      <input type="hidden" name={name} value={itemsJson} />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Package Items</h3>
          <p className="mt-1 text-sm text-slate-500">
            Search the catalog and add supplier or Crossbar products to this package.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {selectedItems.length} selected
        </span>
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products by name, SKU, or brand…"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      {searchError && <p className="mt-2 text-sm text-red-700">{searchError}</p>}

      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
        {searching ? (
          <p className="px-4 py-4 text-sm text-slate-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">No matching products found.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {results.map((product) => {
              const alreadyAdded = selectedItems.some((item) => item.id === product.id);

              return (
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
                      {product.crossbar_category && (
                        <>
                          <span>•</span>
                          <span>{product.crossbar_category}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <SourceBadge sourceType={product.source_type} />

                  <button
                    type="button"
                    onClick={() => addItem(product)}
                    disabled={alreadyAdded}
                    className="flex-shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {alreadyAdded ? "Added" : "Add to Package"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Selected Items
          </h4>
          {selectedItems.length > 0 && (
            <span className="text-xs text-slate-500">
              {selectedItems.length} products &middot; {totalUnits} total units
            </span>
          )}
        </div>

        {selectedItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No products have been added to this package yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {selectedItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <Thumbnail url={item.thumbnail_url} alt={item.display_name} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.display_name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {item.crossbar_sku}
                  </p>
                </div>

                <SourceBadge sourceType={item.source_type} />

                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Qty
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateQuantity(item.id, parseInt(e.target.value, 10) || 1)
                    }
                    className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Requirement
                  </label>
                  <select
                    value={item.required ? "required" : "optional"}
                    onChange={(e) => updateRequired(item.id, e.target.value === "required")}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
