import Sidebar from "@/components/Sidebar";
import BundleProductForm from "@/components/BundleProductForm";

export default function NewBundleProductPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">New Product</p>
            <h1 className="text-2xl font-bold">Bundle / Package</h1>
          </header>

          <div className="p-8">
            <a
              href="/products/new"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="text-lg">←</span>
              Choose Product Type
            </a>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Create Bundle / Package</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a player package, coach package, spirit pack, or other product made from multiple catalog products.
                </p>
              </div>

              <BundleProductForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
