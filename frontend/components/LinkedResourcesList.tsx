"use client";

import { useActionState } from "react";
import {
  updateProductResourceLink,
  unlinkProductResource,
  type ResourceActionState,
} from "@/app/products/[id]/resources/actions";
import { RESOURCE_TYPE_ICONS } from "@/lib/resourceOptions";

const initialState: ResourceActionState = { error: null };

export type LinkedResource = {
  linkId: number;
  resourceId: number;
  resource_type: string;
  title: string;
  summary: string | null;
  version: string | null;
  status: string;
  file_url: string | null;
  external_url: string | null;
  active: boolean;
  relationship_type: string | null;
  required: boolean;
  notes: string | null;
  sort_order: number;
};

function LinkedResourceRow({
  productId,
  resource,
}: {
  productId: number;
  resource: LinkedResource;
}) {
  const updateWithIds = updateProductResourceLink.bind(null, productId, resource.linkId);
  const unlinkWithIds = unlinkProductResource.bind(null, productId, resource.linkId);

  const [updateState, updateAction, updatePending] = useActionState(
    updateWithIds,
    initialState
  );
  const [unlinkState, unlinkAction, unlinkPending] = useActionState(
    unlinkWithIds,
    initialState
  );

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span>{RESOURCE_TYPE_ICONS[resource.resource_type] || "📁"}</span>
            <a
              href={`/operations/resources/${resource.resourceId}`}
              className="font-semibold text-slate-900 hover:underline"
            >
              {resource.title}
            </a>
            {resource.version && (
              <span className="text-xs text-slate-500">v{resource.version}</span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {resource.status}
            </span>
            {!resource.active && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                Archived
              </span>
            )}
          </div>
          {resource.summary && (
            <p className="mt-1 text-sm text-slate-600">{resource.summary}</p>
          )}
        </div>

        <form action={unlinkAction}>
          <button
            type="submit"
            disabled={unlinkPending}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {unlinkPending ? "Unlinking..." : "Unlink"}
          </button>
        </form>
      </div>

      <form action={updateAction} className="mt-3 grid gap-3 md:grid-cols-[1.5fr_0.7fr_1fr_auto]">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Relationship Type
          </label>
          <input
            type="text"
            name="relationship_type"
            defaultValue={resource.relationship_type ?? ""}
            placeholder="Assembly SOP"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Sort Order
          </label>
          <input
            type="number"
            name="sort_order"
            defaultValue={resource.sort_order}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            name="required"
            defaultChecked={resource.required}
            className="h-4 w-4 rounded border-slate-300"
          />
          Required
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={updatePending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatePending ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="md:col-span-4">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Notes
          </label>
          <textarea
            name="notes"
            defaultValue={resource.notes ?? ""}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </form>

      {(updateState?.error || unlinkState?.error) && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {updateState?.error || unlinkState?.error}
        </p>
      )}
    </li>
  );
}

export default function LinkedResourcesList({
  productId,
  resources,
}: {
  productId: number;
  resources: LinkedResource[];
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Linked Resources</h2>
          <p className="mt-1 text-sm text-slate-500">
            Resources currently linked to this product.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {resources.length} linked
        </span>
      </div>

      {resources.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No SOPs, templates, checklists, or documents are linked to this product yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {resources.map((resource) => (
            <LinkedResourceRow key={resource.linkId} productId={productId} resource={resource} />
          ))}
        </ul>
      )}
    </div>
  );
}
