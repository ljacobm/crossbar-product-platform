"use client";

import { useActionState } from "react";
import {
  createCollection,
  updateCollection,
  type CollectionFormState,
} from "@/app/collections/actions";
import SubmitCollectionButton from "@/components/SubmitCollectionButton";

const initialState: CollectionFormState = { error: null };

export type ExistingCollection = {
  id: number;
  name: string;
  description: string | null;
  sport: string | null;
  season: string | null;
  audience: string | null;
  hero_image_url: string | null;
  active: boolean;
};

export default function CollectionForm({
  mode,
  collection,
  cancelHref,
}: {
  mode: "create" | "edit";
  collection?: ExistingCollection;
  cancelHref: string;
}) {
  const action =
    mode === "edit" ? updateCollection.bind(null, collection!.id) : createCollection;

  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Collection Name
          </label>
          <input
            type="text"
            name="name"
            required
            defaultValue={collection?.name}
            placeholder="2026 Fall Lacrosse Essentials"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Sport</label>
          <input
            type="text"
            name="sport"
            defaultValue={collection?.sport ?? ""}
            placeholder="Lacrosse"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Season</label>
          <input
            type="text"
            name="season"
            defaultValue={collection?.season ?? ""}
            placeholder="Fall 2026"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Audience</label>
          <input
            type="text"
            name="audience"
            defaultValue={collection?.audience ?? ""}
            placeholder="Varsity, Youth, Coaches..."
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Description</label>
        <textarea
          name="description"
          rows={4}
          defaultValue={collection?.description ?? ""}
          placeholder="What this collection is for and who it's shared with"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Hero Image URL
        </label>
        <input
          type="url"
          name="hero_image_url"
          defaultValue={collection?.hero_image_url ?? ""}
          placeholder="https://..."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked={collection?.active ?? true}
          className="h-4 w-4 rounded border-slate-300"
        />
        Active
      </label>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
        <a
          href={cancelHref}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        <SubmitCollectionButton
          label={mode === "edit" ? "Save Changes" : "Create Collection"}
          pendingLabel={mode === "edit" ? "Saving..." : "Creating Collection..."}
        />
      </div>
    </form>
  );
}
