"use client";

type Product = {
  id: number;
  crossbar_sku: string;
  display_name: string;
  crossbar_category: string | null;
  brand_display: string | null;
  active: boolean;
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {active ? "Imported" : "Inactive"}
    </span>
  );
}

export default function ProductRow({ product }: { product: Product }) {
  return (
    <tr
      className="cursor-pointer transition hover:bg-slate-50"
      onClick={() => {
        window.location.href = `/products/${product.id}`;
      }}
    >
      <td className="px-4 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-400 ring-1 ring-slate-200">
            🖼️
          </div>

          <div>
            <div className="text-[15px] font-semibold text-slate-900">
              {product.display_name}
            </div>

            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span>{product.brand_display || "No brand"}</span>
              <span>•</span>
              <span className="font-mono">{product.crossbar_sku}</span>
            </div>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 text-slate-700">
        {product.crossbar_category || "-"}
      </td>

      <td className="px-4 py-4">
        <StatusBadge active={product.active} />
      </td>

      <td className="px-4 py-4 text-right text-lg text-slate-400">
        ›
      </td>
    </tr>
  );
}

export type { Product };