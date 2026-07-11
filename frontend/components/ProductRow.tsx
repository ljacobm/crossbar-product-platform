"use client";

type Product = {
  id: number;
  crossbar_sku: string;
  display_name: string;
  crossbar_category: string | null;
  brand_display: string | null;
  active: boolean;
  source_type: string;
  product_images: {
    id: number;
    image_url: string;
    color_name: string | null;
    image_type?: string;
    active?: boolean;
    sort_order: number | null;
  }[];
};

function selectThumbnail(images: Product["product_images"]) {
  const active = images.filter((image) => image.active !== false);
  const hero = active.find((image) => image.image_type === "hero");
  if (hero) return hero;

  return [...active].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id
  )[0];
}

function StatusBadge({
  active,
  sourceType,
}: {
  active: boolean;
  sourceType: string;
}) {
  const label = !active
    ? "Archived"
    : sourceType === "crossbar"
    ? "Crossbar"
    : sourceType === "bundle"
    ? "Bundle"
    : "Imported";

  const styles = !active
    ? "bg-gray-100 text-gray-600"
    : sourceType === "crossbar"
    ? "bg-purple-50 text-purple-700"
    : sourceType === "bundle"
    ? "bg-amber-50 text-amber-700"
    : "bg-blue-50 text-blue-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}

export default function ProductRow({ product }: { product: Product }) {
  const thumbnail = selectThumbnail(product.product_images ?? []);

  return (
    <tr
      className="cursor-pointer transition hover:bg-slate-50"
      onClick={() => {
        window.location.href = `/products/${product.id}`;
      }}
    >
      <td className="px-4 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
            {thumbnail?.image_url ? (
              <img
                src={thumbnail.image_url}
                alt={product.display_name}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <span className="text-lg text-slate-400">
                {product.source_type === "bundle" ? "📦" : "🖼️"}
              </span>
            )}
          </div>

          <div>
            <div className="text-[15px] font-semibold text-slate-900">
              {product.display_name}
            </div>

            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span>{product.brand_display || "No brand"}</span>
              <span>•</span>
              <span className="font-mono">{product.crossbar_sku}</span>
            </div>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 text-slate-700">
        {product.crossbar_category || "-"}
      </td>

      <td className="px-4 py-4">
        <StatusBadge active={product.active} sourceType={product.source_type} />
      </td>

      <td className="px-4 py-4 text-right text-lg text-slate-400">
        ›
      </td>
    </tr>
  );
}

export type { Product };