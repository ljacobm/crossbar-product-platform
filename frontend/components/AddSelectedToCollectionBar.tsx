"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bulkAddProductsToCollection } from "@/app/collections/actions";

export default function AddSelectedToCollectionBar({
  collectionId,
  selectedIds,
}: {
  collectionId: number;
  selectedIds: number[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await bulkAddProductsToCollection(collectionId, selectedIds);

      if (result.error) {
        setError(result.error);
        return;
      }

      router.push(`/collections/${collectionId}?added=${result.addedCount}`);
    });
  }

  return (
    <div className="sticky top-0 z-20 mb-4 rounded-xl border border-slate-300 bg-white p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-900">
          {selectedIds.length} product{selectedIds.length === 1 ? "" : "s"} selected
        </span>

        <button
          type="button"
          disabled={isPending}
          onClick={handleAdd}
          className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Adding..." : "Add Selected to Collection"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
