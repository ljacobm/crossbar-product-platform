import Sidebar from "@/components/Sidebar";
import CollectionForm from "@/components/CollectionForm";

export default function NewCollectionPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Collections</p>
            <h1 className="text-2xl font-bold">New Collection</h1>
          </header>

          <div className="p-8">
            <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow">
              <CollectionForm mode="create" cancelHref="/collections" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
