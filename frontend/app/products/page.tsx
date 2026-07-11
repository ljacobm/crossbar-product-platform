import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import ProductTable from "@/components/ProductTable";
import SummaryCards from "@/components/SummaryCards";
import SearchBar from "@/components/SearchBar";
import ProductFilters from "@/components/ProductFilters";
import { supabase } from "@/lib/supabase";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    brand?: string;
    category?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;

  const q = params.q || "";
  const brand = params.brand || "";
  const category = params.category || "";
  const status = params.status || "active";

  const { data: brandRows } = await supabase
    .from("catalog_products")
    .select("brand_display")
    .not("brand_display", "is", null);

  const { data: categoryRows } = await supabase
    .from("catalog_products")
    .select("crossbar_category")
    .not("crossbar_category", "is", null);

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
          <PageHeader />

          <div className="p-8">

            <SummaryCards />

            <div className="mt-6 rounded-xl bg-white p-6 shadow">

              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">
                    Catalog Products
                  </h3>

                  <p className="text-sm text-gray-500">
                    Search and manage imported supplier products.
                  </p>
                </div>

                <a
                  href="/products/new"
                  className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  New Product
                </a>
              </div>

              <SearchBar placeholder="Search by name, SKU, brand, category..." />

              <ProductFilters brands={brands} categories={categories} />

              <ProductTable
                query={q}
                brand={brand}
                category={category}
                status={status}
              />

            </div>

          </div>
        </section>
      </div>
    </main>
  );
}
