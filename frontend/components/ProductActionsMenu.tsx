"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  archiveProduct,
  restoreProduct,
  type ActionState,
} from "@/app/products/[id]/actions";
import DeleteProductModal from "@/components/DeleteProductModal";

const initialState: ActionState = { error: null };

export default function ProductActionsMenu({
  productId,
  crossbarSku,
  sourceType,
  active,
}: {
  productId: number;
  crossbarSku: string;
  sourceType: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const archiveWithId = archiveProduct.bind(null, productId);
  const restoreWithId = restoreProduct.bind(null, productId);

  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveWithId,
    initialState
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreWithId,
    initialState
  );

  const canDelete = sourceType === "crossbar" || sourceType === "bundle";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
      >
        More Actions ▾
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {active ? (
            <form action={archiveAction}>
              <button
                type="submit"
                disabled={archivePending}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {archivePending ? "Archiving..." : "Archive Product"}
              </button>
            </form>
          ) : (
            <form action={restoreAction}>
              <button
                type="submit"
                disabled={restorePending}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {restorePending ? "Restoring..." : "Restore Product"}
              </button>
            </form>
          )}

          {canDelete && (
            <>
              <div className="my-1 border-t border-slate-200" />

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDeleteModalOpen(true);
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete Permanently
              </button>
            </>
          )}

          {(archiveState?.error || restoreState?.error) && (
            <p className="mt-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {archiveState?.error || restoreState?.error}
            </p>
          )}
        </div>
      )}

      {deleteModalOpen && (
        <DeleteProductModal
          productId={productId}
          crossbarSku={crossbarSku}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
