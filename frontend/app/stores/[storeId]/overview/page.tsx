import { getOnlineStoreById } from "@/lib/onlineStoreData";

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

  return (
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
  );
}
