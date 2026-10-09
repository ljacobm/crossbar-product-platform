import Sidebar from "@/components/Sidebar";

export default function NewProductPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Catalog</p>
            <h1 className="text-2xl font-bold">New Product</h1>
          </header>

          <div className="p-8">
            <a
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="text-lg">←</span>
              Catalog Products
            </a>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <h2 className="text-xl font-semibold">Choose Product Type</h2>
              <p className="mt-1 text-sm text-slate-500">
                Select what kind of product you want to create.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <a
                  href="/products/new/crossbar"
                  className="rounded-xl border-2 border-[#860132] bg-[#860132]/5 p-5 hover:bg-[#860132]/10"
                >
                  <h3 className="text-lg font-semibold text-[#860132]">
                    Crossbar Product
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Create an in-house product like a jersey, pinny, shorts, or custom uniform.
                  </p>
                </a>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 opacity-70">
                  <h3 className="text-lg font-semibold">Supplier Product</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Coming soon. Add or connect a supplier product manually.
                  </p>
                </div>

                <a
                  href="/products/new/bundle"
                  className="rounded-xl border-2 border-[#860132] bg-[#860132]/5 p-5 hover:bg-[#860132]/10"
                >
                  <h3 className="text-lg font-semibold text-[#860132]">
                    Bundle / Package
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Create a player package, coach package, spirit pack, or other product made from multiple catalog products.
                  </p>
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}