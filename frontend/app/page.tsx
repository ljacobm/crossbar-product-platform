import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import ProductTable from "@/components/ProductTable";
import SummaryCards from "@/components/SummaryCards";
import SearchBar from "@/components/SearchBar";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
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

                <button className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                  Add Product
                </button>
              </div>

              <SearchBar placeholder="Search by name, SKU, brand, category..." />

              <ProductTable query={q || ""} />

            </div>

          </div>
        </section>
      </div>
    </main>
  );
}