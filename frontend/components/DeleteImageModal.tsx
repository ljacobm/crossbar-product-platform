"use client";

import { useActionState } from "react";
import {
  deleteProductImage,
  type ImageActionState,
} from "@/app/products/[id]/images/actions";

const initialState: ImageActionState = { error: null };

export default function DeleteImageModal({
  productId,
  imageId,
  imageUrl,
  onClose,
}: {
  productId: number;
  imageId: number;
  imageUrl: string;
  onClose: () => void;
}) {
  const deleteWithIds = deleteProductImage.bind(null, productId, imageId);
  const [state, formAction, pending] = useActionState(deleteWithIds, initialState);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-red-700">Delete Image Permanently</h2>

        <p className="mt-2 text-sm text-slate-600">
          This action cannot be undone. This will permanently remove the uploaded file
          from storage and delete its record.
        </p>

        <div className="mt-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <img src={imageUrl} alt="" className="h-full w-full object-contain p-1" />
        </div>

        <form action={formAction} className="mt-5 space-y-4">
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
