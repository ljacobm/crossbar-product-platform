"use client";

import { useState } from "react";
import ProductRow, { type Product } from "@/components/ProductRow";
import BulkActionBar from "@/components/BulkActionBar";

export default function ProductTableClient({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const someSelected = products.some((p) => selected.has(p.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selected)}
          onDone={() => setSelected(new Set())}
        />
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all products"
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                selected={selected.has(product.id)}
                onToggleSelect={() => toggleOne(product.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
