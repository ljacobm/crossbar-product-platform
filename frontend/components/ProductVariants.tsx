"use client";

import { useMemo, useState } from "react";

type Variant = {
  id: number;
  color_name: string;
  size_name: string;
  supplier_sku: string;
  supplier_price: number | null;
  inventory_qty: number | null;
};

export default function ProductVariants({ variants }: { variants: Variant[] }) {
  const colors = useMemo(() => {
    return Array.from(new Set(variants.map((v) => v.color_name))).sort();
  }, [variants]);

  const [selectedColor, setSelectedColor] = useState(colors[0] || "");

  const selectedVariants = variants
    .filter((v) => v.color_name === selectedColor)
    .sort((a, b) => a.size_name.localeCompare(b.size_name));

  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Variants</h2>
          <p className="text-sm text-slate-500">
            Select a color to view sizes, inventory, supplier SKUs, and pricing.
          </p>
        </div>

        <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
          {variants.length} variants
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Colors
          </h3>

          <div className="space-y-2">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedColor === color
                    ? "bg-[#860132] text-white"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="font-semibold">{selectedColor}</h3>
            <p className="text-sm text-slate-500">
              {selectedVariants.length} size options
            </p>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Supplier SKU</th>
                <th className="px-4 py-3">Inventory</th>
                <th className="px-4 py-3">Supplier Price</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {selectedVariants.map((variant) => (
                <tr key={variant.id}>
                  <td className="px-4 py-3 font-medium">{variant.size_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {variant.supplier_sku}
                  </td>
                  <td className="px-4 py-3">
                    {variant.inventory_qty ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    {variant.supplier_price
                      ? `$${Number(variant.supplier_price).toFixed(2)}`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}