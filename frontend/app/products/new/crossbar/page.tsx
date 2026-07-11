import Sidebar from "@/components/Sidebar";
import CrossbarProductForm from "@/components/CrossbarProductForm";

export default function NewCrossbarProductPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">New Product</p>
            <h1 className="text-2xl font-bold">Crossbar Product</h1>
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
                <h2 className="text-xl font-semibold">
                  Create Crossbar Product
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add an in-house product such as a jersey, pinny, shorts, or custom uniform.
                </p>
              </div>

              <CrossbarProductForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}