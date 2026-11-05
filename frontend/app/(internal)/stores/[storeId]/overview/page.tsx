import { getOnlineStoreById } from "@/lib/onlineStoreData";
import { getPortalLinkStatus } from "@/lib/onlineStorePortalData";
import { isPortalGenerationEnabled } from "@/lib/portalFeatureFlag";
import { getVendorTagAliases, type VendorTagAlias } from "@/lib/onlineStoreVendorTagAliases";
import PortalLinkSection from "@/components/PortalLinkSection";
import VendorTagAliasesSection from "@/components/VendorTagAliasesSection";

export default async function StoreOverviewPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getOnlineStoreById(Number(storeId));

  // The parent layout already confirmed this store exists (and renders its
  // own not-found UI otherwise, so this page never mounts for a missing
  // store) -- this is a second, independent fetch of the same row, matching
  // the existing convention of every products/collections sub-page
  // independently re-fetching its own record rather than relying on
  // parent-to-child data plumbing this app doesn't use anywhere else.
  if (!store) return null;

  const portalLinkStatus = await getPortalLinkStatus(store.id);

  // The Shopify Vendor Tags section is new, additive, and strictly
  // optional for this page -- Store Information and the Customer Portal
  // section below have nothing to do with it and must keep rendering
  // normally regardless of whether this lookup succeeds. Caught here,
  // at the page level (rather than inside getVendorTagAliases() itself),
  // because this is the one place that already treats each section of
  // this page as independently renderable -- getOnlineStoreById()/
  // getPortalLinkStatus() above are NOT wrapped the same way: a failure
  // to load the store itself, or its portal link status, is still
  // treated as a real page-level error, same as before this section
  // existed. Mirrors the same "a failed lookup must not crash the page"
  // principle already applied to the Sales Data discount lookup in
  // lib/salesCalculations.ts -- logged via console.error (so the actual
  // error reaches server/Vercel logs), never swallowed silently.
  let vendorTagAliases: VendorTagAlias[] = [];
  let vendorTagAliasesLoadFailed = false;
  try {
    vendorTagAliases = await getVendorTagAliases(store.id);
  } catch (err) {
    console.error(
      `Failed to load vendor tag aliases for store ${store.id} (Overview page still renders without this section's data):`,
      err
    );
    vendorTagAliasesLoadFailed = true;
  }

  return (
    <>
      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">Store Information</h2>
        <p className="mt-1 text-sm text-slate-500">
          Read-only foundation for future Online Store Creator 3.0 features.
        </p>

        <dl className="mt-5 max-w-md space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Store Name</dt>
            <dd className="font-medium text-slate-900">{store.name}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Vendor / Team Tag</dt>
            <dd className="font-medium text-slate-900">{store.vendor_team_tag || "-"}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-slate-900">{store.active ? "Active" : "Inactive"}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Internal Store ID</dt>
            <dd className="font-mono text-slate-900">{store.id}</dd>
          </div>
        </dl>
      </div>

      <VendorTagAliasesSection
        storeId={store.id}
        primaryTag={store.vendor_team_tag}
        initialAliases={vendorTagAliases}
        loadFailed={vendorTagAliasesLoadFailed}
      />

      <PortalLinkSection
        storeId={store.id}
        initialStatus={portalLinkStatus}
        generationEnabled={isPortalGenerationEnabled()}
      />
    </>
  );
}
