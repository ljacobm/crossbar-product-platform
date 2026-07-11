"use client";

import { useActionState } from "react";
import {
  updateProduct,
  type UpdateProductFormState,
} from "@/app/products/[id]/edit/actions";
import SubmitEditProductButton from "@/components/SubmitEditProductButton";
import BundleItemsEditor, {
  type BundleSelectedItem,
} from "@/components/BundleItemsEditor";

const initialState: UpdateProductFormState = { error: null };

type Product = {
  id: number;
  display_name: string;
  crossbar_sku: string;
  product_slug: string | null;
  description_html: string | null;
  crossbar_category: string | null;
  brand_display: string | null;
  source_type: string;
  active: boolean;
};

type CrossbarData = {
  product_family: string | null;
  production_method: string | null;
  base_template: string | null;
  default_size_range: string | null;
  product_notes: string | null;
  production_notes: string | null;
} | null;

type SupplierData = {
  supplier_style: string | null;
  supplier_title: string | null;
  supplier_brand: string | null;
  supplier_category: string | null;
} | null;

function SourceBadge({ sourceType }: { sourceType: string }) {
  const label =
    sourceType === "bundle" ? "Bundle" : sourceType === "crossbar" ? "Crossbar" : "Imported";

  const styles =
    sourceType === "bundle"
      ? "bg-amber-50 text-amber-700"
      : sourceType === "crossbar"
      ? "bg-purple-50 text-purple-700"
      : "bg-blue-50 text-blue-700";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${styles}`}>
      {label}
    </span>
  );
}

export default function ProductEditForm({
  product,
  crossbarData,
  supplierData,
  bundleItems,
}: {
  product: Product;
  crossbarData: CrossbarData;
  supplierData: SupplierData;
  bundleItems: BundleSelectedItem[];
}) {
  const updateWithId = updateProduct.bind(null, product.id);
  const [state, formAction] = useActionState(updateWithId, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700">Product Source</span>
        <SourceBadge sourceType={product.source_type} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Product Name
          </label>
          <input
            type="text"
            name="display_name"
            required
            defaultValue={product.display_name}
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
            defaultValue={product.crossbar_sku}
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
            defaultValue={product.brand_display ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Category
          </label>
          <input
            type="text"
            name="crossbar_category"
            required
            defaultValue={product.crossbar_category ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          name="description_html"
          rows={4}
          defaultValue={product.description_html ?? ""}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked={product.active}
          className="h-4 w-4 rounded border-slate-300"
        />
        Active
      </label>

      {product.source_type === "supplier" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Supplier Information
          </h3>

          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier Style</dt>
              <dd className="font-mono text-slate-900">
                {supplierData?.supplier_style || "-"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier Title</dt>
              <dd className="text-slate-900">{supplierData?.supplier_title || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier Brand</dt>
              <dd className="text-slate-900">{supplierData?.supplier_brand || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier Category</dt>
              <dd className="text-slate-900">{supplierData?.supplier_category || "-"}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-slate-500">
            Supplier data is managed by imports. Only Crossbar-facing catalog information can
            be edited here.
          </p>
        </div>
      )}

      {product.source_type === "crossbar" && (
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-lg font-semibold">Crossbar Product Details</h3>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Product Family
              </label>
              <input
                type="text"
                name="product_family"
                defaultValue={crossbarData?.product_family ?? ""}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Production Method
              </label>
              <input
                type="text"
                name="production_method"
                defaultValue={crossbarData?.production_method ?? ""}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Base Template
              </label>
              <input
                type="text"
                name="base_template"
                defaultValue={crossbarData?.base_template ?? ""}
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
                defaultValue={crossbarData?.default_size_range ?? ""}
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Product Notes
            </label>
            <textarea
              name="product_notes"
              rows={3}
              defaultValue={crossbarData?.product_notes ?? ""}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
            />
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Production Notes
            </label>
            <textarea
              name="production_notes"
              rows={3}
              defaultValue={crossbarData?.production_notes ?? ""}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
            />
          </div>
        </div>
      )}

      {product.source_type === "bundle" && (
        <div className="border-t border-slate-200 pt-6">
          <BundleItemsEditor initialItems={bundleItems} />
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
        <a
          href={`/products/${product.id}`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        <SubmitEditProductButton />
      </div>
    </form>
  );
}
