import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import ProductTable from "@/components/ProductTable";
import SummaryCards from "@/components/SummaryCards";
import SearchBar from "@/components/SearchBar";
import ProductFilters from "@/components/ProductFilters";
import CatalogViewTabs from "@/components/CatalogViewTabs";
import CommonViewsMenu from "@/components/CommonViewsMenu";
import { supabase } from "@/lib/supabase";
import { getCatalogViewCounts, isCatalogView, type CatalogViewId } from "@/lib/catalogViews";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    brand?: string;
    category?: string;
    status?: string;
    workflow?: string;
    view?: string;
    source?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;

  const q = params.q || "";
  const brand = params.brand || "";
  const category = params.category || "";
  const status = params.status || "active";
  const workflow = params.workflow || "";
  const source = params.source || "";
  const view: CatalogViewId = params.view && isCatalogView(params.view) ? params.view : "all";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const [{ data: brandRows }, { data: categoryRows }, viewCounts] = await Promise.all([
    supabase.from("catalog_products").select("brand_display").not("brand_display", "is", null),
    supabase.from("catalog_products").select("crossbar_category").not("crossbar_category", "is", null),
    getCatalogViewCounts(supabase),
  ]);

  const brands = Array.from(
    new Set((brandRows || []).map((row) => row.brand_display).filter(Boolean))
  ).sort();

  const categories = Array.from(
    new Set((categoryRows || []).map((row) => row.crossbar_category).filter(Boolean))
  ).sort();

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <PageHeader
            title="Catalog Manager"
            subtitle="Review, approve, and prepare products for the Crossbar catalog, website, and team stores."
          />

          <div className="p-8">

            <SummaryCards />

            <div className="mt-6 rounded-xl bg-white p-6 shadow">

              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">
                    Catalog Products
                  </h3>

                  <p className="text-sm text-gray-500">
                    Search and manage imported supplier products.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <CommonViewsMenu />
                  <a
                    href="/products/new"
                    className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    New Product
                  </a>
                </div>
              </div>

              <CatalogViewTabs activeView={view} counts={viewCounts} />

              <SearchBar placeholder="Search by name, SKU, brand, category..." />

              <ProductFilters brands={brands} categories={categories} />

              <ProductTable
                query={q}
                brand={brand}
                category={category}
                status={status}
                workflow={workflow}
                view={view}
                source={source}
                page={page}
              />

            </div>

          </div>
        </section>
      </div>
    </main>
  );
}
