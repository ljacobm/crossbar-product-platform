import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import ResourceForm from "@/components/ResourceForm";

export default async function NewResourcePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const params = await searchParams;
  const rawProductId = params.productId;
  const parsedProductId = rawProductId ? Number(rawProductId) : NaN;
  const productId = Number.isFinite(parsedProductId) ? parsedProductId : undefined;

  let productName: string | undefined;

  if (productId !== undefined) {
    const { data: product } = await supabase
      .from("catalog_products")
      .select("display_name")
      .eq("id", productId)
      .single();

    productName = product?.display_name;
  }

  const cancelHref =
    productId !== undefined ? `/products/${productId}/resources` : "/operations/resources";

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">
              {productId !== undefined ? "New Product Resource" : "New Resource"}
            </p>
            <h1 className="text-2xl font-bold">
              {productId !== undefined ? productName || "Create Resource" : "Create Resource"}
            </h1>
          </header>

          <div className="p-8">
            <a
              href={cancelHref}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="text-lg">←</span>
              {productId !== undefined ? "Back to Product Resources" : "Back to Resource Library"}
            </a>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Create Resource</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add a new SOP, template, checklist, or document to the shared resource
                  library.
                </p>
              </div>

              <ResourceForm
                mode="create"
                productId={productId}
                productName={productName}
                cancelHref={cancelHref}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
