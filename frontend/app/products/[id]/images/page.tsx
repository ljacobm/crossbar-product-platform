import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import ProductImageUploader from "@/components/ProductImageUploader";
import ProductImageCard, { type ProductImageRow } from "@/components/ProductImageCard";
import { IMAGE_TYPES, IMAGE_TYPE_LABELS } from "@/lib/imageOptions";

export default async function ProductImagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: product, error } = await supabase
    .from("catalog_products")
    .select("id, display_name, source_type")
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

  const { data: imagesRaw } = await supabase
    .from("product_images")
    .select(
      "id, image_url, image_type, alt_text, caption, sort_order, active, storage_path"
    )
    .eq("catalog_product_id", id)
    .order("image_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  const images: ProductImageRow[] = imagesRaw ?? [];

  const canManage = product.source_type === "crossbar" || product.source_type === "bundle";
  const isSupplier = product.source_type === "supplier";

  const sections = isSupplier
    ? [
        {
          type: "product" as const,
          label: "Imported Images",
          images,
        },
      ]
    : IMAGE_TYPES.map((type) => ({
        type,
        label: IMAGE_TYPE_LABELS[type],
        images: images.filter((image) => image.image_type === type),
      }));

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Product Images</p>
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

              {canManage && (
                <a
                  href="#upload-images"
                  className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Upload Images
                </a>
              )}
            </div>

            {isSupplier && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Supplier images are managed by the supplier import.
              </div>
            )}

            {canManage && (
              <div id="upload-images" className="mb-8 rounded-xl bg-white p-6 shadow">
                <h2 className="mb-4 text-lg font-semibold">Upload Images</h2>
                <ProductImageUploader productId={product.id} />
              </div>
            )}

            <div className="space-y-8">
              {sections.map((section) => (
                <div key={section.type} className="rounded-xl bg-white p-6 shadow">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{section.label}</h2>
                    <span className="text-sm text-slate-500">
                      {section.images.length} image{section.images.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {section.images.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      No {section.label.toLowerCase()}{" "}
                      {section.type === "hero" ? "has" : "have"} been added yet.
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {section.images.map((image) => (
                        <ProductImageCard
                          key={image.id}
                          productId={product.id}
                          image={image}
                          readOnly={!canManage}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
