import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import ProductEditForm from "@/components/ProductEditForm";
import type { BundleSelectedItem } from "@/components/BundleItemsEditor";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: product, error } = await supabase
    .from("catalog_products")
    .select(
      `
      id,
      display_name,
      crossbar_sku,
      product_slug,
      description_html,
      crossbar_category,
      brand_display,
      source_type,
      active
      `
    )
    .eq("id", id)
    .single();

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

  let crossbarData: {
    product_family: string | null;
    production_method: string | null;
    base_template: string | null;
    default_size_range: string | null;
    product_notes: string | null;
    production_notes: string | null;
  } | null = null;

  let supplierData: {
    supplier_style: string | null;
    supplier_title: string | null;
    supplier_brand: string | null;
    supplier_category: string | null;
  } | null = null;

  let bundleItems: BundleSelectedItem[] = [];

  if (product.source_type === "crossbar") {
    const { data } = await supabase
      .from("crossbar_product_data")
      .select(
        `
        product_family,
        production_method,
        base_template,
        default_size_range,
        product_notes,
        production_notes
        `
      )
      .eq("catalog_product_id", id)
      .maybeSingle();

    crossbarData = data;
  }

  if (product.source_type === "supplier") {
    const { data } = await supabase
      .from("supplier_products")
      .select("supplier_style, supplier_title, supplier_brand, supplier_category")
      .eq("catalog_product_id", id)
      .order("id", { ascending: true })
      .limit(1);

    supplierData = data?.[0] ?? null;
  }

  if (product.source_type === "bundle") {
    const { data: items } = await supabase
      .from("product_bundle_items")
      .select(
        `
        id,
        quantity,
        required,
        sort_order,
        child:catalog_products!child_catalog_product_id (
          id,
          display_name,
          crossbar_sku,
          brand_display,
          crossbar_category,
          source_type,
          active,
          product_images (
            id,
            image_url,
            sort_order
          )
        )
        `
      )
      .eq("bundle_catalog_product_id", id)
      .order("sort_order", { ascending: true });

    type RawItem = {
      quantity: number;
      required: boolean;
      child: {
        id: number;
        display_name: string;
        crossbar_sku: string;
        brand_display: string | null;
        crossbar_category: string | null;
        source_type: string;
        active: boolean;
        product_images: { id: number; image_url: string; sort_order: number | null }[];
      } | null;
    };

    bundleItems = ((items as unknown as RawItem[]) ?? [])
      .filter((item) => item.child)
      .map((item) => {
        const child = item.child!;
        const thumbnail = [...(child.product_images || [])].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        )[0];

        return {
          id: child.id,
          display_name: child.display_name,
          crossbar_sku: child.crossbar_sku,
          brand_display: child.brand_display,
          crossbar_category: child.crossbar_category,
          source_type: child.source_type,
          active: child.active,
          thumbnail_url: thumbnail?.image_url ?? null,
          quantity: item.quantity,
          required: item.required,
        };
      });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Edit Product</p>
            <h1 className="text-2xl font-bold">{product.display_name}</h1>
          </header>

          <div className="p-8">
            <a
              href={`/products/${product.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="text-lg">←</span>
              Back to Product
            </a>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Edit Product</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Update the catalog information for this product.
                </p>
              </div>

              <ProductEditForm
                product={product}
                crossbarData={crossbarData}
                supplierData={supplierData}
                bundleItems={bundleItems}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
