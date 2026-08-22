import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import SearchBar from "@/components/SearchBar";
import OnlineStoresList from "@/components/OnlineStoresList";
import { getOnlineStores } from "@/lib/onlineStoreData";

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q || "";

  const stores = await getOnlineStores(q);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <PageHeader
            title="Online Stores"
            subtitle="Team Store Creator 2.0 stores tracked in Crossbar OS."
          />

          <div className="p-8">
            <div className="rounded-xl bg-white p-6 shadow">
              <div className="mb-6">
                <h3 className="text-xl font-semibold">Online Stores</h3>
                <p className="text-sm text-gray-500">
                  Search and open a store&apos;s workspace.
                </p>
              </div>

              <SearchBar placeholder="Search stores by name or team tag..." basePath="/stores" />

              <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
                <span>Showing {stores.length} stores</span>
                <span>Sorted by name</span>
              </div>

              <OnlineStoresList stores={stores} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
