import { supabase } from "@/lib/supabase";
import ProductTableClient from "@/components/ProductTableClient";
import ProductPagination from "@/components/ProductPagination";
import {
  queryProducts,
  CATALOG_VIEW_EMPTY_MESSAGES,
  type CatalogViewId,
} from "@/lib/catalogViews";

const PAGE_SIZE = 50;

export default async function ProductTable({
  query = "",
  brand = "",
  category = "",
  status = "active",
  workflow = "",
  view = "all",
  source = "",
  page = 1,
}: {
  query?: string;
  brand?: string;
  category?: string;
  status?: string;
  workflow?: string;
  view?: CatalogViewId;
  source?: string;
  page?: number;
}) {
  const { products, count: total, error } = await queryProducts(supabase, {
    query,
    brand,
    category,
    source,
    status,
    workflow,
    view,
    page,
    pageSize: PAGE_SIZE,
  });

  const hasRefiners = Boolean(query || brand || category || workflow || source);
  const emptyMessage = hasRefiners
    ? "No products match the current search and filters."
    : CATALOG_VIEW_EMPTY_MESSAGES[view];

  const from = (page - 1) * PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : from + 1;
  const rangeEnd = Math.min(from + products.length, total);

  const preservedParams = {
    q: query || undefined,
    brand: brand || undefined,
    category: category || undefined,
    workflow: workflow || undefined,
    view: view !== "all" ? view : undefined,
    source: source || undefined,
    status: view === "all" && status !== "active" ? status : undefined,
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load products. Please try again.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {total === 0
            ? "Showing 0 of 0 products"
            : `Showing ${rangeStart}-${rangeEnd} of ${total.toLocaleString()} products`}
        </span>
        <span>Sorted by product name</span>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <ProductTableClient
          key={`${view}-${source}-${status}-${query}-${brand}-${category}-${workflow}-${page}`}
          products={products}
        />
      )}

      <ProductPagination
        basePath="/products"
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        preservedParams={preservedParams}
      />
    </div>
  );
}
