"use client";

import { useActionState, useState } from "react";
import { deleteCollection, type CollectionActionState } from "@/app/collections/actions";

const initialState: CollectionActionState = { error: null };

export default function DeleteCollectionButton({
  collectionId,
  collectionName,
}: {
  collectionId: number;
  collectionName: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteWithId = deleteCollection.bind(null, collectionId);
  const [state, formAction, pending] = useActionState(deleteWithId, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        Delete Collection
      </button>

      {state?.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Delete &ldquo;{collectionName}&rdquo;?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              This permanently deletes the collection. Products in it are never deleted or
              modified — only their membership in this collection is removed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <form action={formAction}>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Deleting..." : "Delete Collection"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
