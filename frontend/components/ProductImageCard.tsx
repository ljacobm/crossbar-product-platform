"use client";

import { useActionState, useState } from "react";
import {
  updateProductImage,
  setHeroProductImage,
  archiveProductImage,
  restoreProductImage,
  type ImageActionState,
} from "@/app/products/[id]/images/actions";
import DeleteImageModal from "@/components/DeleteImageModal";
import { IMAGE_TYPES, IMAGE_TYPE_LABELS, type ImageType } from "@/lib/imageOptions";

const initialState: ImageActionState = { error: null };

export type ProductImageRow = {
  id: number;
  image_url: string;
  image_type: string;
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  active: boolean;
  storage_path: string | null;
};

export default function ProductImageCard({
  productId,
  image,
  readOnly,
}: {
  productId: number;
  image: ProductImageRow;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const updateWithIds = updateProductImage.bind(null, productId, image.id);
  const heroWithIds = setHeroProductImage.bind(null, productId, image.id);
  const archiveWithIds = archiveProductImage.bind(null, productId, image.id);
  const restoreWithIds = restoreProductImage.bind(null, productId, image.id);

  const [updateState, updateAction, updatePending] = useActionState(
    updateWithIds,
    initialState
  );
  const [heroState, heroAction, heroPending] = useActionState(heroWithIds, initialState);
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveWithIds,
    initialState
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreWithIds,
    initialState
  );

  const combinedError =
    updateState?.error || heroState?.error || archiveState?.error || restoreState?.error;

  const missingAltWarning = image.image_type !== "hero" && !image.alt_text?.trim();

  return (
    <div
      className={`rounded-xl border p-4 ${
        image.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-75"
      }`}
    >
      <div className="flex gap-4">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <img
            src={image.image_url}
            alt={image.alt_text || ""}
            className="h-full w-full object-contain p-1"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {IMAGE_TYPE_LABELS[image.image_type as ImageType] || image.image_type}
            </span>
            {!image.active && (
              <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                Archived
              </span>
            )}
            <span className="text-xs text-slate-400">Sort {image.sort_order}</span>
          </div>

          <p className="truncate text-sm text-slate-700">
            {image.alt_text || <span className="italic text-slate-400">No alt text</span>}
          </p>

          {image.caption && <p className="text-xs text-slate-500">{image.caption}</p>}

          {missingAltWarning && <p className="text-xs text-amber-600">⚠ Missing alt text</p>}
        </div>
      </div>

      {combinedError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {combinedError}
        </p>
      )}

      {!readOnly && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {image.image_type !== "hero" && image.active && (
              <form action={heroAction}>
                <button
                  type="submit"
                  disabled={heroPending}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {heroPending ? "Setting..." : "Set as Hero"}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {editing ? "Cancel Edit" : "Edit Details"}
            </button>

            {image.active ? (
              <form action={archiveAction}>
                <button
                  type="submit"
                  disabled={archivePending}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {archivePending ? "Archiving..." : "Remove"}
                </button>
              </form>
            ) : (
              <form action={restoreAction}>
                <button
                  type="submit"
                  disabled={restorePending}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {restorePending ? "Restoring..." : "Restore"}
                </button>
              </form>
            )}

            {image.storage_path && (
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Delete Permanently
              </button>
            )}
          </div>

          {editing && (
            <form
              action={updateAction}
              className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2"
            >
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Image Type
                </label>
                <select
                  name="image_type"
                  defaultValue={image.image_type}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {IMAGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {IMAGE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Sort Order
                </label>
                <input
                  type="number"
                  name="sort_order"
                  defaultValue={image.sort_order}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Alt Text
                </label>
                <input
                  type="text"
                  name="alt_text"
                  defaultValue={image.alt_text ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Caption
                </label>
                <input
                  type="text"
                  name="caption"
                  defaultValue={image.caption ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={image.active}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Active
              </label>

              <div className="flex items-end justify-end">
                <button
                  type="submit"
                  disabled={updatePending}
                  className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatePending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {readOnly && (
        <p className="mt-3 text-xs text-slate-500">
          Supplier images are managed by the supplier import.
        </p>
      )}

      {deleteModalOpen && (
        <DeleteImageModal
          productId={productId}
          imageId={image.id}
          imageUrl={image.image_url}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}
