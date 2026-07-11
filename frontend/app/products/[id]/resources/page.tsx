import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import LinkedResourcesList, { type LinkedResource } from "@/components/LinkedResourcesList";
import AvailableResourcesPicker from "@/components/AvailableResourcesPicker";

export default async function ProductResourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: product, error } = await supabase
    .from("catalog_products")
    .select("id, display_name")
    .eq("id", id)
    .single();

  if (error || !product) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <section className="flex-1 p-8">
            <div className="rounded-xl bg-white p-6 shadow">Product not found.</div>
          </section>
        </div>
      </main>
    );
  }

  type RawResourceLink = {
    id: number;
    relationship_type: string | null;
    required: boolean;
    notes: string | null;
    sort_order: number | null;
    resource: {
      id: number;
      resource_type: string;
      title: string;
      summary: string | null;
      version: string | null;
      status: string;
      file_url: string | null;
      external_url: string | null;
      active: boolean;
    } | null;
  };

  const { data: resourceLinksRaw } = await supabase
    .from("product_resource_links")
    .select(
      `
      id,
      relationship_type,
      required,
      notes,
      sort_order,
      resource:knowledge_resources (
        id,
        resource_type,
        title,
        summary,
        version,
        status,
        file_url,
        external_url,
        active
      )
      `
    )
    .eq("catalog_product_id", id);

  const resources: LinkedResource[] = ((resourceLinksRaw as unknown as RawResourceLink[]) ?? [])
    .filter((link) => link.resource)
    .map((link) => ({
      linkId: link.id,
      resourceId: link.resource!.id,
      resource_type: link.resource!.resource_type,
      title: link.resource!.title,
      summary: link.resource!.summary,
      version: link.resource!.version,
      status: link.resource!.status,
      file_url: link.resource!.file_url,
      external_url: link.resource!.external_url,
      active: link.resource!.active,
      relationship_type: link.relationship_type,
      required: link.required,
      notes: link.notes,
      sort_order: link.sort_order ?? 0,
    }))
    .sort((a, b) => {
      const typeCompare = a.resource_type.localeCompare(b.resource_type);
      if (typeCompare !== 0) return typeCompare;

      const sortCompare = a.sort_order - b.sort_order;
      if (sortCompare !== 0) return sortCompare;

      return a.title.localeCompare(b.title);
    });

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Product Resources</p>
            <h1 className="text-2xl font-bold">{product.display_name}</h1>
          </header>

          <div className="p-8">
            <div className="mb-6 flex items-center justify-between">
              <a
                href={`/products/${product.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <span className="text-lg">←</span>
                Back to Product
              </a>

              <div className="flex gap-2">
                <a
                  href="#available-resources"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Add Existing Resource
                </a>

                <a
                  href={`/operations/resources/new?productId=${product.id}`}
                  className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Create New Resource
                </a>
              </div>
            </div>

            <LinkedResourcesList productId={product.id} resources={resources} />

            <div id="available-resources">
              <AvailableResourcesPicker productId={product.id} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
