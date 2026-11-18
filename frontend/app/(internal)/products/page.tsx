import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import ProductTable from "@/components/ProductTable";
import SummaryCards from "@/components/SummaryCards";
import SearchBar from "@/components/SearchBar";
import ProductFilters from "@/components/ProductFilters";
import CatalogViewTabs from "@/components/CatalogViewTabs";
import CommonViewsMenu from "@/components/CommonViewsMenu";
import ApprovedStyleImportForm from "@/components/ApprovedStyleImportForm";
import ApprovedStyleRow from "@/components/ApprovedStyleRow";
import { isCatalogView, type CatalogViewId } from "@/lib/catalogViews";
import { getCatalogViewCounts, getCatalogBrandCategoryFacets } from "@/lib/catalogProductData";
import { listApprovedCatalogStyles } from "@/lib/approvedCatalogStyleData";

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
    styleQ?: string;
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
  // Separate search param from the main product search (q) -- this
  // filters the approved-style management list below by style CODE,
  // a different field/semantic than the product name/SKU/brand/category
  // search the main SearchBar already does. Only read/used when the
  // Team Store Ready tab is active.
  const styleQ = params.styleQ || "";

  const [{ brands, categories }, viewCounts, approvedStyles] = await Promise.all([
    getCatalogBrandCategoryFacets(),
    getCatalogViewCounts(),
    view === "team-store-ready" ? listApprovedCatalogStyles({ query: styleQ }) : Promise.resolve([]),
  ]);

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

              {view === "team-store-ready" && (
                <div className="mb-6 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    <strong>This tab is the authoritative source for customer team store eligibility.</strong>{" "}
                    Products shown below come from the approved SanMar style list (
                    <code className="rounded bg-white/60 px-1">approved_catalog_styles</code>), not the general{" "}
                    <em>Team Store Ready</em> workflow flag staff set elsewhere in the Catalog Manager (
                    <code className="rounded bg-white/60 px-1">catalog_settings.team_store_enabled</code>). The two
                    are intentionally separate and are never synchronized.
                  </p>

                  <ApprovedStyleImportForm />

                  <div className="rounded-xl bg-white p-6 shadow">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Approved Styles ({approvedStyles.length})</h3>
                      <form>
                        <input type="hidden" name="view" value="team-store-ready" />
                        <input
                          type="text"
                          name="styleQ"
                          defaultValue={styleQ}
                          placeholder="Search style code..."
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        />
                      </form>
                    </div>

                    {approvedStyles.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">
                        No approved styles yet. Paste SanMar style codes above to get started.
                      </p>
                    ) : (
                      <table className="mt-4 w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="py-2">Style Code</th>
                            <th className="py-2">Product</th>
                            <th className="py-2">Brand</th>
                            <th className="py-2">Category</th>
                            <th className="py-2">Status</th>
                            <th className="py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {approvedStyles.map((style) => (
                            <ApprovedStyleRow key={style.id} style={style} />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

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
