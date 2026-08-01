import Sidebar from "@/components/Sidebar";
import CollectionForm from "@/components/CollectionForm";
import { supabase } from "@/lib/supabase";

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: collection, error } = await supabase
    .from("collections")
    .select("id, name, description, sport, season, audience, hero_image_url, active")
    .eq("id", id)
    .single();

  if (error || !collection) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <section className="flex-1 p-8">
            <div className="rounded-xl bg-white p-6 shadow">Collection not found.</div>
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
            <p className="text-sm font-medium text-slate-500">Collections</p>
            <h1 className="text-2xl font-bold">Edit {collection.name}</h1>
          </header>

          <div className="p-8">
            <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow">
              <CollectionForm
                mode="edit"
                collection={collection}
                cancelHref={`/collections/${collection.id}`}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
