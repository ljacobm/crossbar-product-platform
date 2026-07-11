"use client";

import { useActionState } from "react";
import {
  deleteProductPermanently,
  type ActionState,
} from "@/app/products/[id]/actions";

const initialState: ActionState = { error: null };

export default function DeleteProductModal({
  productId,
  crossbarSku,
  onClose,
}: {
  productId: number;
  crossbarSku: string;
  onClose: () => void;
}) {
  const deleteWithId = deleteProductPermanently.bind(null, productId);
  const [state, formAction, pending] = useActionState(
    deleteWithId,
    initialState
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-red-700">
          Delete Product Permanently
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          This action cannot be undone. This will permanently delete{" "}
          <span className="font-mono font-semibold">{crossbarSku}</span> and
          all of its variants, images, and Crossbar product data.
        </p>

        <form action={formAction} className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Type <span className="font-mono">{crossbarSku}</span> to
              confirm
            </label>
            <input
              type="text"
              name="confirm_sku"
              required
              autoComplete="off"
              placeholder={crossbarSku}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
            />
          </div>

          {state?.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Deleting..." : "Delete Permanently"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
