"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  removeProductFromCollection,
  bulkRemoveProductsFromCollection,
  type CollectionActionState,
} from "@/app/collections/actions";
import WorkflowStatusBadge from "@/components/WorkflowStatusBadge";

const initialState: CollectionActionState = { error: null };

export type CollectionProduct = {
  linkId: number;
  catalogProductId: number;
  displayName: string;
  crossbarSku: string;
  brandDisplay: string | null;
  category: string | null;
  sourceType: string;
  ageGroup: string | null;
  active: boolean;
  workflowStatus: string;
  websiteReady: boolean;
  teamStoreEnabled: boolean;
  supplierStatus: string | null;
  thumbnailUrl: string | null;
};

function isProblem(product: CollectionProduct): boolean {
  return (
    !product.active ||
    product.workflowStatus === "Archived" ||
    product.supplierStatus === "Discontinued"
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

function SourceBadge({ sourceType }: { sourceType: string }) {
  const label = sourceType === "crossbar" ? "Crossbar" : sourceType === "bundle" ? "Bundle" : "Supplier";
  const styles =
    sourceType === "crossbar"
      ? "bg-purple-50 text-purple-700"
      : sourceType === "bundle"
      ? "bg-amber-50 text-amber-700"
      : "bg-blue-50 text-blue-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}

function ProductRow({
  collectionId,
  product,
  selected,
  onToggleSelect,
}: {
  collectionId: number;
  product: CollectionProduct;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const removeWithIds = removeProductFromCollection.bind(null, collectionId, product.linkId);
  const [state, formAction, pending] = useActionState(removeWithIds, initialState);
  const problem = isProblem(product);

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${problem ? "bg-red-50/40" : ""}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select ${product.displayName}`}
        className="h-4 w-4 flex-shrink-0 rounded border-slate-300"
      />

      <Thumbnail url={product.thumbnailUrl} alt={product.displayName} />

      <div className="min-w-0 flex-1">
        <a
          href={`/products/${product.catalogProductId}`}
          className="truncate text-sm font-semibold text-slate-900 hover:underline"
        >
          {product.displayName}
        </a>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{product.brandDisplay || "No brand"}</span>
          <span>•</span>
          <span className="font-mono">{product.crossbarSku}</span>
          {product.category && (
            <>
              <span>•</span>
              <span>{product.category}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
        <SourceBadge sourceType={product.sourceType} />
        <WorkflowStatusBadge status={product.workflowStatus} />
        {product.websiteReady && (
          <span title="Website Ready" aria-label="Website Ready" className="text-sm">
            🌐
          </span>
        )}
        {product.teamStoreEnabled && (
          <span title="Enabled for Team Stores" aria-label="Enabled for Team Stores" className="text-sm">
            🏬
          </span>
        )}
        {problem && (
          <span
            title="This product is archived, inactive, or discontinued by the supplier"
            aria-label="Warning: product is archived, inactive, or discontinued"
            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700"
          >
            ⚠ Needs Review
          </span>
        )}
      </div>

      <form action={formAction} className="flex-shrink-0">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Removing..." : "Remove"}
        </button>
      </form>

      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
    </li>
  );
}

export default function CollectionProductsList({
  collectionId,
  products,
}: {
  collectionId: number;
  products: CollectionProduct[];
}) {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const brands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brandDisplay).filter((v): v is string => Boolean(v)))).sort(),
    [products]
  );
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter((v): v is string => Boolean(v)))).sort(),
    [products]
  );
  const ageGroups = useMemo(
    () => Array.from(new Set(products.map((p) => p.ageGroup).filter((v): v is string => Boolean(v)))).sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.displayName.toLowerCase().includes(q) && !p.crossbarSku.toLowerCase().includes(q)) {
        return false;
      }
      if (brand && p.brandDisplay !== brand) return false;
      if (category && p.category !== category) return false;
      if (ageGroup && p.ageGroup !== ageGroup) return false;
      if (source && p.sourceType !== source) return false;
      return true;
    });
  }, [products, search, brand, category, ageGroup, source]);

  const hasFilters = Boolean(search || brand || category || ageGroup || source);

  function clearFilters() {
    setSearch("");
    setBrand("");
    setCategory("");
    setAgeGroup("");
    setSource("");
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.linkId));
  const someVisibleSelected = filtered.some((p) => selected.has(p.linkId));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filtered.forEach((p) => next.delete(p.linkId));
      } else {
        filtered.forEach((p) => next.add(p.linkId));
      }
      return next;
    });
  }

  function toggleOne(linkId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  function handleBulkRemove() {
    setConfirmRemove(false);
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkRemoveProductsFromCollection(collectionId, Array.from(selected));
      if (result.error) {
        setBulkError(result.error);
      } else {
        setSelected(new Set());
      }
    });
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Products</h2>
          <p className="mt-1 text-sm text-slate-500">
            Showing {filtered.length} of {products.length} products
          </p>
        </div>
      </div>

      {products.length > 0 && (
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this collection..."
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
          />

          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
          >
            <option value="">All Brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
          >
            <option value="">All Sources</option>
            <option value="supplier">Supplier</option>
            <option value="crossbar">Crossbar</option>
            <option value="bundle">Bundle</option>
          </select>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Filters
          </button>
        </div>
      )}

      {ageGroups.length > 0 && (
        <div className="mb-4">
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
          >
            <option value="">All Ages</option>
            {ageGroups.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-4 rounded-xl border border-slate-300 bg-white p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-900">
              {selected.size} product{selected.size === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmRemove(true)}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {isPending ? "Removing..." : "Remove Selected"}
            </button>
          </div>
          {bulkError && <p className="mt-2 text-sm text-red-600">{bulkError}</p>}
        </div>
      )}

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No products have been added to this collection yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No collection products match the current filters.
        </p>
      ) : (
        <div className="rounded-lg border border-slate-200">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
              }}
              onChange={toggleAllVisible}
              aria-label="Select all displayed products"
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Select All Displayed
            </span>
          </div>

          <ul className="divide-y divide-slate-200">
            {filtered.map((product) => (
              <ProductRow
                key={product.linkId}
                collectionId={collectionId}
                product={product}
                selected={selected.has(product.linkId)}
                onToggleSelect={() => toggleOne(product.linkId)}
              />
            ))}
          </ul>
        </div>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Remove {selected.size} product{selected.size === 1 ? "" : "s"} from this collection?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              This only removes them from this collection. Products themselves are never
              archived, deleted, or changed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkRemove}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
