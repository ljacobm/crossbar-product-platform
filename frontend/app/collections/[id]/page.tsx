import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import CollectionProductsList, {
  type CollectionProduct,
} from "@/components/CollectionProductsList";
import CollectionProductPicker from "@/components/CollectionProductPicker";
import DeleteCollectionButton from "@/components/DeleteCollectionButton";

function selectThumbnail(
  images: { id: number; image_url: string; image_type?: string; active?: boolean; sort_order: number | null }[]
) {
  const active = (images || []).filter((image) => image.active !== false);
  const hero = active.find((image) => image.image_type === "hero");
  if (hero) return hero;
  return [...active].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id
  )[0];
}

export default async function CollectionWorkspacePage({
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

  type RawRow = {
    id: number;
    catalog_product_id: number;
    sort_order: number | null;
    product: {
      id: number;
      display_name: string;
      crossbar_sku: string;
      product_images: {
        id: number;
        image_url: string;
        image_type?: string;
        active?: boolean;
        sort_order: number | null;
      }[];
      catalog_settings: { workflow_status: string } | { workflow_status: string }[] | null;
    } | null;
  };

  const { data: rawProducts } = await supabase
    .from("collection_products")
    .select(
      `
      id,
      catalog_product_id,
      sort_order,
      product:catalog_products (
        id,
        display_name,
        crossbar_sku,
        product_images (
          id,
          image_url,
          image_type,
          active,
          sort_order
        ),
        catalog_settings (
          workflow_status
        )
      )
      `
    )
    .eq("collection_id", id)
    .order("sort_order", { ascending: true });

  const products: CollectionProduct[] = ((rawProducts as unknown as RawRow[]) ?? [])
    .filter((row) => row.product)
    .map((row) => {
      const product = row.product!;
      const settings = Array.isArray(product.catalog_settings)
        ? product.catalog_settings[0]
        : product.catalog_settings;
      const thumbnail = selectThumbnail(product.product_images ?? []);

      return {
        linkId: row.id,
        catalogProductId: product.id,
        displayName: product.display_name,
        crossbarSku: product.crossbar_sku,
        workflowStatus: settings?.workflow_status || "Imported",
        thumbnailUrl: thumbnail?.image_url ?? null,
      };
    });

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Collection Workspace</p>
                <h1 className="text-2xl font-bold">{collection.name}</h1>
              </div>
            </div>
          </header>

          <div className="p-8">
            <div className="mb-4">
              <a
                href="/collections"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <span className="text-lg">←</span>
                Collections
              </a>
            </div>

            <div className="rounded-xl bg-white p-6 shadow">
              <div className="flex items-start justify-between gap-6">
                <div className="flex gap-6">
                  <div className="flex h-28 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                    {collection.hero_image_url ? (
                      <img
                        src={collection.hero_image_url}
                        alt={collection.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl text-slate-300">🖼️</span>
                    )}
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold">Collection Information</h2>

                    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <dt className="text-slate-500">Sport</dt>
                      <dd className="font-medium text-slate-900">{collection.sport || "-"}</dd>

                      <dt className="text-slate-500">Season</dt>
                      <dd className="font-medium text-slate-900">{collection.season || "-"}</dd>

                      <dt className="text-slate-500">Audience</dt>
                      <dd className="font-medium text-slate-900">{collection.audience || "-"}</dd>

                      <dt className="text-slate-500">Status</dt>
                      <dd>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            collection.active
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {collection.active ? "Active" : "Inactive"}
                        </span>
                      </dd>
                    </dl>

                    {collection.description && (
                      <p className="mt-3 max-w-xl text-sm text-slate-600">
                        {collection.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <a
                    href={`/collections/${collection.id}/edit`}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Edit Collection
                  </a>
                  <DeleteCollectionButton
                    collectionId={collection.id}
                    collectionName={collection.name}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6">
              <CollectionProductsList collectionId={collection.id} products={products} />
            </div>

            <CollectionProductPicker collectionId={collection.id} />
          </div>
        </section>
      </div>
    </main>
  );
}
