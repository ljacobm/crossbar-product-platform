import { supabase } from "@/lib/supabase";
import ProductRow, { Product } from "./ProductRow";

export default async function ProductTable({ query = "" }: { query?: string }) {
  let request = supabase
  .from("catalog_products")
  .select(
    "id, crossbar_sku, display_name, crossbar_category, brand_display, active",
    { count: "exact" }
  )
  .order("display_name", { ascending: true })
  .limit(50);

if (query) {
  request = request.or(
    `display_name.ilike.%${query}%,crossbar_sku.ilike.%${query}%,brand_display.ilike.%${query}%,crossbar_category.ilike.%${query}%`
  );
}

const { data: products, error, count } = await request;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          Showing {products?.length ?? 0} of {count ?? 0} products
        </span>
        <span>Sorted by product name</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {(products as Product[]).map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}