type BundleChildProduct = {
  id: number;
  display_name: string;
  crossbar_sku: string;
  brand_display: string | null;
  crossbar_category: string | null;
  source_type: string;
  active: boolean;
  product_images: { id: number; image_url: string; sort_order: number | null }[];
};

type BundleItem = {
  id: number;
  quantity: number;
  required: boolean;
  sort_order: number | null;
  child: BundleChildProduct | null;
};

export default function BundlePackageItems({ items }: { items: BundleItem[] }) {
  const totalUnits = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Package Items</h2>
        {items.length > 0 && (
          <div className="text-sm text-slate-500">
            {items.length} products &middot; {totalUnits} total units
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">
          This package does not contain any products yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {items.map((item) => {
            const child = item.child;

            if (!child) return null;

            const thumbnail = [...(child.product_images || [])].sort(
              (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
            )[0];

            return (
              <li key={item.id} className="flex flex-wrap items-center gap-4 px-4 py-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                  {thumbnail ? (
                    <img
                      src={thumbnail.image_url}
                      alt={child.display_name}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-lg text-slate-400">📦</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <a
                    href={`/products/${child.id}`}
                    className="text-sm font-semibold text-slate-900 hover:underline"
                  >
                    {child.display_name}
                  </a>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{child.brand_display || "No brand"}</span>
                    <span>&bull;</span>
                    <span className="font-mono">{child.crossbar_sku}</span>
                    {child.crossbar_category && (
                      <>
                        <span>&bull;</span>
                        <span>{child.crossbar_category}</span>
                      </>
                    )}
                  </p>
                </div>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  Qty {item.quantity}
                </span>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.required
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.required ? "Required" : "Optional"}
                </span>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    child.source_type === "crossbar"
                      ? "bg-purple-50 text-purple-700"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {child.source_type === "crossbar" ? "Crossbar" : "Imported"}
                </span>

                {!child.active && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                    Archived
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
