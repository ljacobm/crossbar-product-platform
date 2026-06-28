import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";
import ProductVariants from "@/components/ProductVariants";
import ProductColorSelector from "@/components/ProductColorSelector";
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
          <PageHeader />

          <div className="p-8">
            <a href="/" className="text-sm text-[#860132]">
              ← Back to Products
            </a>

            <ProductHeroWorkspace
              product={product}
              images={images}
              variants={variants}
            />

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <h2 className="text-lg font-semibold">Overview</h2>
              <p className="mt-2 text-sm text-slate-600">
                Product details, description, website settings, pricing, decoration notes, and internal Crossbar knowledge will live here.
              </p>
            </div>

          </div>
        </section>
      </div>
    </main>
  );
}