import Sidebar from "@/components/Sidebar";
import EditOnlineStoreForm from "@/components/EditOnlineStoreForm";
import { getOnlineStoreById } from "@/lib/onlineStoreData";

export default async function EditOnlineStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getOnlineStoreById(Number(storeId));

  if (!store) return null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Edit Store</p>
            <h1 className="text-2xl font-bold">{store.name}</h1>
          </header>

          <div className="p-8">
            <a
              href={`/stores/${store.id}/overview`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="text-lg">←</span>
              Back to Overview
            </a>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Store Details</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Editing here never affects this store&apos;s customer catalog
                  access link, decoration assets, or forms.
                </p>
              </div>

              <EditOnlineStoreForm store={store} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
