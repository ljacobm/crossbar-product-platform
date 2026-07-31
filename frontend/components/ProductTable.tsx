import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ProductTableClient from "@/components/ProductTableClient";
import { Product } from "./ProductRow";
import {
  applyCatalogView,
  getArchivedProductIds,
  CATALOG_VIEW_EMPTY_MESSAGES,
  type CatalogViewId,
} from "@/lib/catalogViews";

const PAGE_SIZE = 50;

function buildPageHref(
  params: Record<string, string | undefined>,
  page: number
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/products?${qs}` : "/products";
}

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
  let request = supabase
    .from("catalog_products")
    .select(
      `
      id,
      crossbar_sku,
      display_name,
      crossbar_category,
      brand_display,
      active,
      source_type,
      product_images (
        id,
        image_url,
        color_name,
        image_type,
        active,
        sort_order
      ),
      catalog_settings!inner (
        workflow_status,
        website_ready,
        team_store_enabled
      )
      `,
      { count: "exact" }
    )
    .order("display_name", { ascending: true });

  if (query) {
    request = request.or(
      `display_name.ilike.%${query}%,crossbar_sku.ilike.%${query}%,brand_display.ilike.%${query}%,crossbar_category.ilike.%${query}%`
    );
  }

  if (brand) {
    request = request.eq("brand_display", brand);
  }

  if (category) {
    request = request.eq("crossbar_category", category);
  }

  if (source) {
    request = request.eq("source_type", source);
  }

  if (view === "all") {
    if (status === "active") {
      request = request.eq("active", true);
    } else if (status === "archived") {
      request = request.eq("active", false);
    }
  } else if (view === "archived") {
    const archivedIds = await getArchivedProductIds(supabase);
    request = request.in("id", archivedIds.length > 0 ? archivedIds : [-1]);
  } else {
    request = applyCatalogView(request, view);
  }

  if (workflow) {
    request = request.eq("catalog_settings.workflow_status", workflow);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  request = request.range(from, to);

  const { data, error, count } = await request;
  const products = (data as Product[]) ?? [];
  const total = count ?? 0;

  const hasRefiners = Boolean(query || brand || category || workflow || source);
  const emptyMessage = hasRefiners
    ? "No products match the current search and filters."
    : CATALOG_VIEW_EMPTY_MESSAGES[view];

  const rangeStart = total === 0 ? 0 : from + 1;
  const rangeEnd = Math.min(from + products.length, total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={buildPageHref(preservedParams, page - 1)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>

          {page < totalPages ? (
            <Link
              href={buildPageHref(preservedParams, page + 1)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
