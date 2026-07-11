"use client";

import { useActionState } from "react";
import {
  createBundleProduct,
  type BundleProductFormState,
} from "@/app/products/new/bundle/actions";
import SubmitBundleButton from "@/components/SubmitBundleButton";
import BundleItemsEditor from "@/components/BundleItemsEditor";

const initialState: BundleProductFormState = { error: null };

export default function BundleProductForm() {
  const [state, formAction] = useActionState(createBundleProduct, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Bundle Name
          </label>
          <input
            type="text"
            name="display_name"
            required
            placeholder="Varsity Lacrosse Player Package"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Crossbar SKU
          </label>
          <input
            type="text"
            name="crossbar_sku"
            required
            placeholder="CB-LAX-VARSITY-PACKAGE"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Brand
          </label>
          <input
            type="text"
            name="brand_display"
            required
            defaultValue="Crossbar"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Category
          </label>
          <select
            name="crossbar_category"
            required
            defaultValue="Player Packages"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          >
            <option>Player Packages</option>
            <option>Coach Packages</option>
            <option>Uniform Packages</option>
            <option>Spirit Packs</option>
            <option>Equipment Packages</option>
            <option>Other Packages</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          name="description_html"
          rows={4}
          placeholder="A configurable lacrosse player package containing Crossbar-made and supplier products."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked
          className="h-4 w-4 rounded border-slate-300"
        />
        Active
      </label>

      <div className="border-t border-slate-200 pt-6">
        <BundleItemsEditor />
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
        <a
          href="/products/new"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        <SubmitBundleButton />
      </div>
    </form>
  );
}
