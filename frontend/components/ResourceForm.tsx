"use client";

import { useActionState } from "react";
import {
  createKnowledgeResource,
  updateKnowledgeResource,
  type ResourceFormState,
} from "@/app/operations/resources/actions";
import ResourceRichTextEditor from "@/components/ResourceRichTextEditor";
import SubmitResourceButton from "@/components/SubmitResourceButton";
import SaveResourceButton from "@/components/SaveResourceButton";
import { RESOURCE_TYPES, RESOURCE_STATUSES } from "@/lib/resourceOptions";

const initialState: ResourceFormState = { error: null };

export type ExistingResource = {
  id: number;
  title: string;
  resource_type: string;
  summary: string | null;
  department: string | null;
  version: string | null;
  status: string;
  owner_name: string | null;
  estimated_minutes: number | null;
  content_html: string | null;
  file_url: string | null;
  external_url: string | null;
  active: boolean;
};

export default function ResourceForm({
  mode,
  resource,
  productId,
  productName,
  cancelHref,
}: {
  mode: "create" | "edit";
  resource?: ExistingResource;
  productId?: number;
  productName?: string;
  cancelHref: string;
}) {
  const action =
    mode === "edit"
      ? updateKnowledgeResource.bind(null, resource!.id)
      : createKnowledgeResource.bind(null, productId ?? null);

  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {mode === "create" && productId && (
        <div className="rounded-lg border border-[#860132]/30 bg-[#860132]/5 px-4 py-3 text-sm text-[#860132]">
          This resource will automatically be linked to{" "}
          <strong>{productName || `product #${productId}`}</strong>.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Title</label>
          <input
            type="text"
            name="title"
            required
            defaultValue={resource?.title}
            placeholder="Sew Field Lacrosse Jersey"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Resource Type
          </label>
          <select
            name="resource_type"
            required
            defaultValue={resource?.resource_type ?? "SOP"}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          >
            {RESOURCE_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Department</label>
          <input
            type="text"
            name="department"
            defaultValue={resource?.department ?? ""}
            placeholder="Sewing"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Version</label>
          <input
            type="text"
            name="version"
            defaultValue={resource?.version ?? (mode === "create" ? "V1" : "")}
            placeholder="V1"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Status</label>
          <select
            name="status"
            defaultValue={resource?.status ?? "Draft"}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          >
            {RESOURCE_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Owner</label>
          <input
            type="text"
            name="owner_name"
            defaultValue={resource?.owner_name ?? ""}
            placeholder="Jordan Smith"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Estimated Minutes
          </label>
          <input
            type="number"
            min={0}
            step={1}
            name="estimated_minutes"
            defaultValue={resource?.estimated_minutes ?? ""}
            placeholder="30"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Summary</label>
        <textarea
          name="summary"
          rows={2}
          defaultValue={resource?.summary ?? ""}
          placeholder="Short summary shown in the library and product workspace"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Rich Content</label>
        <ResourceRichTextEditor initialContent={resource?.content_html ?? ""} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Primary File URL
          </label>
          <input
            type="url"
            name="file_url"
            defaultValue={resource?.file_url ?? ""}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            External Link / Video URL
          </label>
          <input
            type="url"
            name="external_url"
            defaultValue={resource?.external_url ?? ""}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked={resource?.active ?? true}
          className="h-4 w-4 rounded border-slate-300"
        />
        Active
      </label>

      {mode === "create" && productId && (
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-lg font-semibold">Link to This Product</h3>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Relationship Type
              </label>
              <input
                type="text"
                name="relationship_type"
                placeholder="Assembly SOP"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />
            </div>

            <label className="mt-7 flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="required"
                className="h-4 w-4 rounded border-slate-300"
              />
              Required
            </label>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Product-Specific Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Notes about how this resource applies to this product"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
            />
          </div>
        </div>
      )}

      {mode === "edit" && resource && (
        <p className="text-sm text-slate-500">
          To manage which products use this resource, see{" "}
          <a
            href={`/operations/resources/${resource.id}`}
            className="font-medium text-[#860132] underline"
          >
            Linked Products
          </a>{" "}
          on the resource viewer.
        </p>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
        <a
          href={cancelHref}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        {mode === "edit" ? <SaveResourceButton /> : <SubmitResourceButton />}
      </div>
    </form>
  );
}
