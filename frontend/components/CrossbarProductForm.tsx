"use client";

import { useActionState } from "react";
import {
  createCrossbarProduct,
  type CrossbarProductFormState,
} from "@/app/products/new/crossbar/actions";
import SubmitProductButton from "@/components/SubmitProductButton";

const initialState: CrossbarProductFormState = { error: null };

export default function CrossbarProductForm() {
  const [state, formAction] = useActionState(createCrossbarProduct, initialState);

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
            Product Name
          </label>
          <input
            type="text"
            name="display_name"
            required
            placeholder="Crossbar Field Lacrosse Jersey"
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
            placeholder="CB-LAX-FIELD-JERSEY"
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
            defaultValue="Uniforms"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          >
            <option>Uniforms</option>
            <option>Jerseys</option>
            <option>Shorts</option>
            <option>Pinnies</option>
            <option>Shooter Shirts</option>
            <option>Packages</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Product Family
          </label>
          <input
            type="text"
            name="product_family"
            placeholder="Lacrosse"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Production Method
          </label>
          <select
            name="production_method"
            defaultValue="Sublimation"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          >
            <option>Sublimation</option>
            <option>Cut and Sew</option>
            <option>DTF</option>
            <option>Embroidery</option>
            <option>Screen Print</option>
            <option>Mixed</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Base Template
          </label>
          <input
            type="text"
            name="base_template"
            placeholder="Field Jersey Template V1"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Default Size Range
          </label>
          <input
            type="text"
            name="default_size_range"
            placeholder="YS-4XL"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Product Description
        </label>
        <textarea
          name="description_html"
          rows={4}
          placeholder="Custom sublimated field lacrosse jersey made by Crossbar."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Production Notes
        </label>
        <textarea
          name="production_notes"
          rows={4}
          placeholder="Add production details, decoration notes, material notes, or internal instructions."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
        <a
          href="/products/new"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        <SubmitProductButton />
      </div>
    </form>
  );
}
