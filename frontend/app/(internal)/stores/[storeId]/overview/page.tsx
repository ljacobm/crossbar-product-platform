import { getOnlineStoreById } from "@/lib/onlineStoreData";
import { getPortalLinkStatus } from "@/lib/onlineStorePortalData";
import { isPortalGenerationEnabled } from "@/lib/portalFeatureFlag";
import PortalLinkSection from "@/components/PortalLinkSection";

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

  return (
    <>
      <div className="rounded-xl bg-white p-6 shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Store Information</h2>
            <p className="mt-1 text-sm text-slate-500">
              Active means Crossbar staff can access and configure this store --
              it is separate from whether a customer-facing storefront is ready
              to launch.
            </p>
          </div>
          <a
            href={`/stores/${store.id}/overview/edit`}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Edit Store Details
          </a>
        </div>

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
            <dt className="text-slate-500">Fundraiser Rate</dt>
            <dd className="font-medium text-slate-900">
              {(store.fundraiser_rate * 100).toFixed(2).replace(/\.00$/, "")}%
            </dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Organization Type</dt>
            <dd className="font-medium text-slate-900">{store.organization_type || "-"}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Sport</dt>
            <dd className="font-medium text-slate-900">{store.sport || "-"}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Contact Name</dt>
            <dd className="font-medium text-slate-900">{store.contact_name || "-"}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Contact Email</dt>
            <dd className="font-medium text-slate-900">{store.contact_email || "-"}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Contact Phone</dt>
            <dd className="font-medium text-slate-900">{store.contact_phone || "-"}</dd>
          </div>

          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Internal Store ID</dt>
            <dd className="font-mono text-slate-900">{store.id}</dd>
          </div>
        </dl>

        {store.notes && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <dt className="text-sm text-slate-500">Internal Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{store.notes}</dd>
          </div>
        )}
      </div>

      <PortalLinkSection
        storeId={store.id}
        initialStatus={portalLinkStatus}
        generationEnabled={isPortalGenerationEnabled()}
      />
    </>
  );
}
