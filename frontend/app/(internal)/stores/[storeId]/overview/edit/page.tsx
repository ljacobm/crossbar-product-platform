import EditOnlineStoreForm from "@/components/EditOnlineStoreForm";
import { getOnlineStoreById } from "@/lib/onlineStoreData";

// Nested under app/(internal)/stores/[storeId]/layout.tsx, which already
// renders the full page shell (Sidebar, store-name header,
// StoreWorkspaceTabs, and a "Online Stores" back link) for every route
// under /stores/[storeId]/... -- this page renders only its own content
// fragment, matching the sibling overview/page.tsx's pattern, not a
// second full <main><Sidebar> shell (that duplicated the layout's own
// chrome -- caught and fixed during Preview browser testing).
export default async function EditOnlineStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getOnlineStoreById(Number(storeId));

  if (!store) return null;

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Edit Store Details</h2>
        <p className="mt-1 text-sm text-slate-500">
          Editing here never affects this store&apos;s customer catalog access
          link, decoration assets, or forms.
        </p>
      </div>

      <EditOnlineStoreForm store={store} />
    </div>
  );
}
