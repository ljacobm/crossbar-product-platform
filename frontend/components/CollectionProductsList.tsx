"use client";

import { useActionState } from "react";
import {
  removeProductFromCollection,
  type CollectionActionState,
} from "@/app/collections/actions";
import WorkflowStatusBadge from "@/components/WorkflowStatusBadge";

const initialState: CollectionActionState = { error: null };

export type CollectionProduct = {
  linkId: number;
  catalogProductId: number;
  displayName: string;
  crossbarSku: string;
  workflowStatus: string;
  thumbnailUrl: string | null;
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

function ProductRow({
  collectionId,
  product,
}: {
  collectionId: number;
  product: CollectionProduct;
}) {
  const removeWithIds = removeProductFromCollection.bind(null, collectionId, product.linkId);
  const [state, formAction, pending] = useActionState(removeWithIds, initialState);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Thumbnail url={product.thumbnailUrl} alt={product.displayName} />

      <div className="min-w-0 flex-1">
        <a
          href={`/products/${product.catalogProductId}`}
          className="truncate text-sm font-semibold text-slate-900 hover:underline"
        >
          {product.displayName}
        </a>
        <p className="mt-0.5 font-mono text-xs text-slate-500">{product.crossbarSku}</p>
      </div>

      <WorkflowStatusBadge status={product.workflowStatus} />

      <form action={formAction}>
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
  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Products</h2>
          <p className="mt-1 text-sm text-slate-500">
            Products currently in this collection.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {products.length} products
        </span>
      </div>

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No products have been added to this collection yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {products.map((product) => (
            <ProductRow key={product.linkId} collectionId={collectionId} product={product} />
          ))}
        </ul>
      )}
    </div>
  );
}
