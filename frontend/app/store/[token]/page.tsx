import { getCustomerCatalogWorkspace } from "@/lib/onlineStoreCatalogCustomerData";
import CatalogFilterBar from "@/components/CatalogFilterBar";
import CatalogStyleGrid from "@/components/CatalogStyleGrid";
import { parseCatalogSearchParams, type CatalogRawSearchParams } from "@/lib/catalogSearchParams";

// Customer-facing catalog workspace -- outside app/(internal)/ by
// design, same reasoning as app/portal/[token]/page.tsx: no staff
// session exists for a visitor here, no Sidebar is imported, and
// proxy.ts's PUBLIC_PATH_PREFIXES must include "/store" for this
// route to ever be reachable without a staff login (see that file).
// Deliberately "/store" and NOT "/catalog" -- app/(internal)/catalog/
// (the staff Catalog Manager redirect + /catalog/approved-styles)
// already occupies that URL prefix; a second, public route tree under
// the same prefix would collide with it.
//
// "Never rely solely on an unverified store identifier in the URL":
// the URL carries ONLY an opaque token -- getCustomerCatalogWorkspace()
// resolves the store id from it, server-side, on every request; there
// is no code path here that reads or trusts a store id from the
// client at all.
export const dynamic = "force-dynamic";

function CatalogHeader({ storeName, totalApprovedCount }: { storeName?: string; totalApprovedCount?: number }) {
  // Mobile gets reduced padding, smaller type, and shorter
  // instructional copy; every sm: variant below matches the ORIGINAL
  // (pre-compaction) classes/text exactly, so the desktop header is
  // byte-for-byte unchanged at sm: and above.
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-10 sm:py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#860132] sm:text-sm">Crossbar Athletics</p>
      <h1 className="mt-0.5 text-lg font-bold text-slate-900 sm:mt-1 sm:text-2xl">
        {storeName ? `${storeName} — Team Store Catalog` : "Team Store Catalog"}
      </h1>
      {typeof totalApprovedCount === "number" && (
        <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">
          <span className="sm:hidden">{totalApprovedCount.toLocaleString()} products available.</span>
          <span className="hidden sm:inline">
            Browse {totalApprovedCount.toLocaleString()} approved SanMar products and pick your colors below.
          </span>
        </p>
      )}
    </header>
  );
}

// Generic, non-disclosing unavailable state -- shown identically
// whether the token is malformed, unknown, revoked, expired, or the
// store itself is inactive. No reason is ever distinguished in the
// response, matching the non-disclosure convention already used for
// the fundraiser portal.
function UnavailableLinkPage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <CatalogHeader />
      <div className="mx-auto max-w-lg px-6 py-16 text-center sm:px-10">
        <h2 className="text-lg font-semibold text-slate-900">This link isn&apos;t available</h2>
        <p className="mt-2 text-sm text-slate-600">
          This catalog link is invalid, has been disabled, or has expired. Please contact your
          Crossbar Athletics team store coordinator for an updated link.
        </p>
      </div>
    </main>
  );
}

const PAGE_SIZE = 24;

export default async function CustomerCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<CatalogRawSearchParams>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const { filters, preservedParams } = parseCatalogSearchParams(sp, PAGE_SIZE);

  const workspace = await getCustomerCatalogWorkspace(token, filters);

  if (!workspace) {
    return <UnavailableLinkPage />;
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <CatalogHeader storeName={workspace.storeName} totalApprovedCount={workspace.totalApprovedCount} />

      <div className="px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
        <div className="flex flex-col gap-6 lg:flex-row">
          <CatalogFilterBar facets={workspace.facets} />

          <div className="min-w-0 flex-1">
            <p className="mb-3 text-sm text-slate-500">
              {workspace.totalMatching.toLocaleString()} product{workspace.totalMatching === 1 ? "" : "s"} match your filters
            </p>

            <CatalogStyleGrid
              token={token}
              styles={workspace.styles}
              initialSelectedCount={workspace.selectedCount}
              pagination={{
                basePath: `/store/${token}`,
                page: workspace.page,
                total: workspace.totalMatching,
                pageSize: workspace.pageSize,
                preservedParams,
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
