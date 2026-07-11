import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import ProductHeroWorkspace from "@/components/ProductHeroWorkspace";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: product, error } = await supabase
    .from("catalog_products")
    .select(`
      *,
      product_images (
        id,
        image_url,
        color_name,
        sort_order
      ),
      product_variants (
        id,
        color_name,
        size_name,
        supplier_sku,
        supplier_price,
        inventory_qty
      )
    `)
    .eq("id", id)
    .single();

  const images = product?.product_images ?? [];
  const heroImage = images[0];
  const variants = product?.product_variants ?? [];

  if (error || !product) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <section className="flex-1 p-8">
            <div className="rounded-xl bg-white p-6 shadow">
              Product not found.
            </div>
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
                <p className="text-sm font-medium text-slate-500">
                  Product Workspace
                </p>
                <h2 className="text-2xl font-bold text-slate-900">
                  {product.display_name}
                </h2>
              </div>
            </div>
          </header>

          <div className="p-8">
            <div className="mb-4">
              <a
                href="/products"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                <span className="text-lg">←</span>
                <span>Products Search</span>
              </a>
            </div>

            <ProductHeroWorkspace
              product={product}
              images={images}
              variants={variants}
            />

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <h2 className="text-lg font-semibold">Product Information</h2>

              <div className="mt-5 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Description
                  </h3>

                  <div
                    className="mt-2 text-sm leading-6 text-slate-700"
                    dangerouslySetInnerHTML={{
                      __html:
                        product.description_html ||
                        "No product description available yet.",
                    }}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Details
                  </h3>

                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Brand</dt>
                      <dd className="font-medium text-slate-900">
                        {product.brand_display || "-"}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Category</dt>
                      <dd className="font-medium text-slate-900">
                        {product.crossbar_category || "-"}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Crossbar SKU</dt>
                      <dd className="font-mono text-slate-900">
                        {product.crossbar_sku || "-"}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="font-medium text-blue-700">
                        {!product.active
                          ? "Archived"
                          : product.source_type === "crossbar"
                          ? "Crossbar Product"
                          : "Imported"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

          </div>
        </section>
      </div>
    </main>
  );
}