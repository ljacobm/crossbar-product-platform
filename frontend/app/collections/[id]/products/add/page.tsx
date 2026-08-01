import Sidebar from "@/components/Sidebar";
import SearchBar from "@/components/SearchBar";
import CollectionSelectorFilters from "@/components/CollectionSelectorFilters";
import CollectionSelectorPresets from "@/components/CollectionSelectorPresets";
import CollectionProductSelectorTable from "@/components/CollectionProductSelectorTable";
import { supabase } from "@/lib/supabase";
import { isCollectionEligibleView, type CollectionEligibleView } from "@/lib/catalogViews";

export default async function AddProductsToCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    brand?: string;
    category?: string;
    source?: string;
    workflowView?: string;
    ageGroup?: string;
    gender?: string;
    youthOnly?: string;
    page?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const { data: collection, error } = await supabase
    .from("collections")
    .select("id, name")
    .eq("id", id)
    .single();

  if (error || !collection) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <section className="flex-1 p-8">
            <div className="rounded-xl bg-white p-6 shadow">Collection not found.</div>
          </section>
        </div>
      </main>
    );
  }

  const q = sp.q || "";
  const brand = sp.brand || "";
  const category = sp.category || "";
  const source = sp.source || "";
  const ageGroup = sp.ageGroup || "";
  const gender = sp.gender || "";
  const youthOnly = sp.youthOnly === "true";
  const workflowView: CollectionEligibleView =
    sp.workflowView && isCollectionEligibleView(sp.workflowView) ? sp.workflowView : "approved";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const [{ data: existingLinks }, { data: brandRows }, { data: categoryRows }, { data: ageGroupRows }] =
    await Promise.all([
      supabase
        .from("collection_products")
        .select("catalog_product_id")
        .eq("collection_id", collection.id),
      supabase.from("catalog_products").select("brand_display").not("brand_display", "is", null),
      supabase.from("catalog_products").select("crossbar_category").not("crossbar_category", "is", null),
      supabase.from("catalog_products").select("age_group").not("age_group", "is", null),
    ]);

  const excludeIds = (existingLinks || []).map((row) => row.catalog_product_id);

  const brands = Array.from(
    new Set((brandRows || []).map((row) => row.brand_display).filter(Boolean))
  ).sort();

  const categories = Array.from(
    new Set((categoryRows || []).map((row) => row.crossbar_category).filter(Boolean))
  ).sort();

  const ageGroups = Array.from(
    new Set((ageGroupRows || []).map((row) => row.age_group).filter(Boolean))
  ).sort();

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Add Products to Collection</p>
            <h1 className="text-2xl font-bold">{collection.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Browse the approved catalog, select products, and add them to this collection.
            </p>
          </header>

          <div className="p-8">
            <div className="mb-4 flex items-center gap-2">
              <a
                href={`/collections/${collection.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <span className="text-lg">←</span>
                Back to Collection
              </a>

              <a
                href={`/collections/${collection.id}`}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Cancel
              </a>
            </div>

            <div className="rounded-xl bg-white p-6 shadow">
              <CollectionSelectorPresets
                collectionId={collection.id}
                activeView={workflowView}
                activeSource={source}
                activeYouthOnly={youthOnly}
              />

              <SearchBar
                placeholder="Search by name, Crossbar SKU, or brand..."
                basePath={`/collections/${collection.id}/products/add`}
              />

              <CollectionSelectorFilters
                collectionId={collection.id}
                brands={brands}
                categories={categories}
                ageGroups={ageGroups}
              />

              <CollectionProductSelectorTable
                collectionId={collection.id}
                excludeIds={excludeIds}
                query={q}
                brand={brand}
                category={category}
                source={source}
                workflowView={workflowView}
                ageGroup={ageGroup}
                gender={gender}
                youthOnly={youthOnly}
                page={page}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
