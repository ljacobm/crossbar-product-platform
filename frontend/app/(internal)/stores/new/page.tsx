import Sidebar from "@/components/Sidebar";
import AddOnlineStoreForm from "@/components/AddOnlineStoreForm";

export default function NewOnlineStorePage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">New Store</p>
            <h1 className="text-2xl font-bold">Add Online Store</h1>
          </header>

          <div className="p-8">
            <a
              href="/stores"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="text-lg">←</span>
              Back to Stores
            </a>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Store Details</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Only Store Name is required. The new store is active immediately
                  and ready for staff to configure -- creating it does not generate
                  a customer catalog link or any other customer-facing surface.
                </p>
              </div>

              <AddOnlineStoreForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
