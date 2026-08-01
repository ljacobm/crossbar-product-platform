import { supabase } from "@/lib/supabase";
import ProductTableClient from "@/components/ProductTableClient";
import ProductPagination from "@/components/ProductPagination";
import {
  queryProducts,
  isCollectionEligibleView,
  type CollectionEligibleView,
} from "@/lib/catalogViews";

const PAGE_SIZE = 50;

const VIEW_EMPTY_MESSAGES: Record<CollectionEligibleView, string> = {
  approved: "No eligible products match the current filters.",
  "website-ready": "No eligible products match the current filters.",
  "team-store-ready": "No eligible products match the current filters.",
};

export default async function CollectionProductSelectorTable({
  collectionId,
  excludeIds,
  query,
  brand,
  category,
  source,
  workflowView,
  ageGroup,
  gender,
  youthOnly,
  page,
}: {
  collectionId: number;
  excludeIds: number[];
  query: string;
  brand: string;
  category: string;
  source: string;
  workflowView: string;
  ageGroup: string;
  gender: string;
  youthOnly: boolean;
  page: number;
}) {
  const view: CollectionEligibleView = isCollectionEligibleView(workflowView)
    ? workflowView
    : "approved";

  const { products, count: total, error } = await queryProducts(supabase, {
    query,
    brand,
    category,
    source,
    view,
    ageGroup,
    gender,
    youthOnly,
    excludeIds,
    page,
    pageSize: PAGE_SIZE,
  });

  const hasRefiners = Boolean(query || brand || category || source || ageGroup || gender || youthOnly);
  const noResultsBecauseAllAdded = !hasRefiners && excludeIds.length > 0 && total === 0;

  const emptyMessage = noResultsBecauseAllAdded
    ? "All matching products are already in this collection."
    : hasRefiners
    ? "No eligible products match the current filters."
    : VIEW_EMPTY_MESSAGES[view];

  const from = (page - 1) * PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : from + 1;
  const rangeEnd = Math.min(from + products.length, total);

  const preservedParams = {
    q: query || undefined,
    brand: brand || undefined,
    category: category || undefined,
    source: source || undefined,
    workflowView: view !== "approved" ? view : undefined,
    ageGroup: ageGroup || undefined,
    gender: gender || undefined,
    youthOnly: youthOnly ? "true" : undefined,
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
          key={`${view}-${source}-${query}-${brand}-${category}-${ageGroup}-${gender}-${youthOnly}-${page}`}
          products={products}
          disableRowNavigation
          bulkBarMode="add-to-collection"
          collectionId={collectionId}
        />
      )}

      <ProductPagination
        basePath={`/collections/${collectionId}/products/add`}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        preservedParams={preservedParams}
      />
    </div>
  );
}
