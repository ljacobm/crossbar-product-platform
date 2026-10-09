import Sidebar from "@/components/Sidebar";
import StoreWorkspaceTabs from "@/components/StoreWorkspaceTabs";
import { getOnlineStoreById } from "@/lib/onlineStoreData";

export default async function StoreWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ storeId: string }>;
  children: React.ReactNode;
}) {
  const { storeId } = await params;
  const store = await getOnlineStoreById(Number(storeId));

  if (!store) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <section className="flex-1 p-8">
            <div className="rounded-xl bg-white p-6 shadow">Store not found.</div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Store Workspace</p>
                <h2 className="text-2xl font-bold text-slate-900">{store.name}</h2>
              </div>
            </div>
          </header>

          <StoreWorkspaceTabs storeId={store.id} />

          <div className="p-8">
            <div className="mb-4">
              <a
                href="/stores"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                <span className="text-lg">←</span>
                <span>Online Stores</span>
              </a>
            </div>

            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
