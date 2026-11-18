import { getOnlineStoreById } from "@/lib/onlineStoreData";
import { getStoreCatalogPreview } from "@/lib/onlineStoreCatalogCustomerData";
import CatalogFilterBar from "@/components/CatalogFilterBar";
import CatalogPreviewCard from "@/components/CatalogPreviewCard";
import ProductPagination from "@/components/ProductPagination";
import { parseCatalogSearchParams, type CatalogRawSearchParams } from "@/lib/catalogSearchParams";

const PAGE_SIZE = 24;

// Staff-only preview of the customer-facing catalog -- "make it easy
// to preview the customer-facing catalog," and "the staff preview
// should show the same sidebar, search, sorting, and product filtering
// experience as customers." Shares getStoreCatalogPreview() ->
// buildCatalogWorkspace() AND the same CatalogFilterBar component AND
// the same parseCatalogSearchParams() query parsing with the real
// customer page (app/store/[token]/page.tsx) -- this is EXACTLY what a
// customer would see and do with filters, read-only, never a second
// drifting implementation. Only product selection/saving is disabled
// here (CatalogPreviewCard never passes onSave to the modal), per
// "keep product selection and saving disabled in preview mode."
// requireStaffSession()-gated (inside getStoreCatalogPreview itself) --
// never needs or reads a customer's raw access token.
export default async function StoreCatalogPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<CatalogRawSearchParams>;
}) {
  const { storeId } = await params;
  const sp = await searchParams;
  const id = Number(storeId);
  const { filters, preservedParams } = parseCatalogSearchParams(sp, PAGE_SIZE);

  const store = await getOnlineStoreById(id);
  if (!store) return <div className="rounded-xl bg-white p-6 shadow">Store not found.</div>;

  const workspace = await getStoreCatalogPreview(id, filters);
  if (!workspace) return <div className="rounded-xl bg-white p-6 shadow">Could not load the catalog preview.</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Staff preview.</strong> This shows exactly what a customer with a valid link sees for{" "}
        <strong>{store.name}</strong>, including search, sorting, and filters -- read-only here; nothing on this page
        is ever saved, and no selection can be made.
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">
          {workspace.totalApprovedCount.toLocaleString()} Approved Product{workspace.totalApprovedCount === 1 ? "" : "s"}
        </h2>

        <div className="mt-4 flex flex-col gap-6 lg:flex-row">
          <CatalogFilterBar facets={workspace.facets} />

          <div className="min-w-0 flex-1">
            <p className="mb-3 text-sm text-slate-500">
              {workspace.totalMatching.toLocaleString()} product{workspace.totalMatching === 1 ? "" : "s"} match your filters
            </p>

            {workspace.styles.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                No products match your filters right now.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6">
                {workspace.styles.map((style) => (
                  <CatalogPreviewCard key={style.approvedCatalogStyleId} style={style} />
                ))}
              </div>
            )}

            <ProductPagination
              basePath={`/stores/${id}/catalog/preview`}
              page={workspace.page}
              total={workspace.totalMatching}
              pageSize={workspace.pageSize}
              preservedParams={preservedParams}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
