"use client";

import { useMemo, useState } from "react";

type Product = {
  display_name: string;
  crossbar_sku: string;
  brand_display: string | null;
  crossbar_category: string | null;
};

type Image = {
  id: number;
  image_url: string;
  color_name: string | null;
};

type Variant = {
  id: number;
  color_name: string;
  size_name: string;
  supplier_sku: string;
  supplier_price: number | null;
  inventory_qty: number | null;
};

const sizeOrder = [
  "YS",
  "YM",
  "YL",
  "YXL",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
];

function sortSizes(a: Variant, b: Variant) {
  const ai = sizeOrder.indexOf(a.size_name);
  const bi = sizeOrder.indexOf(b.size_name);

  if (ai === -1 && bi === -1) {
    return a.size_name.localeCompare(b.size_name);
  }

  if (ai === -1) return 1;
  if (bi === -1) return -1;

  return ai - bi;
}

export default function ProductHeroWorkspace({
  product,
  images,
  variants,
}: {
  product: Product;
  images: Image[];
  variants: Variant[];
}) {
  const colors = useMemo(
    () => Array.from(new Set(variants.map((v) => v.color_name))).sort(),
    [variants]
  );

  const [selectedColor, setSelectedColor] = useState(colors[0] || "");

  const selectedColorVariants = variants
  .filter((v) => v.color_name === selectedColor)
  .sort(sortSizes);

  const selectedImage =
    images.find((img) => img.color_name === selectedColor) || images[0];

    const [copyStatus, setCopyStatus] = useState("Copy Product Image");

    async function copyImageToClipboard() {
      if (!selectedImage) return;

      try {
        await navigator.clipboard.writeText(selectedImage.image_url);

        setCopyStatus("Image URL Copied!");
        setTimeout(() => setCopyStatus("Copy Product Image"), 2000);
      } catch (err) {
        console.error(err);
        setCopyStatus("Copy failed");
        setTimeout(() => setCopyStatus("Copy Product Image"), 2000);
      }
    }

  return (
    <div className="flex gap-8">
      <div className="w-[340px] flex-shrink-0">
        <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
          {selectedImage ? (
            <img
              src={selectedImage.image_url}
              alt={product.display_name}
              className="h-full w-full rounded-2xl object-contain p-3"
            />
          ) : (
            <span className="text-6xl text-slate-300">🖼️</span>
          )}
        </div>

        <div className="mt-4">
        <button
          onClick={copyImageToClipboard}
          className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50"
        >
          📋 {copyStatus}
        </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {images.slice(0, 6).map((image) => (
            <button
              key={image.id}
              onClick={() =>
                image.color_name && setSelectedColor(image.color_name)
              }
              className={`h-16 w-16 rounded-lg border bg-slate-100 p-1 ${
                image.color_name === selectedColor
                  ? "border-[#860132] ring-2 ring-[#860132]/20"
                  : "border-slate-200"
              }`}
            >
              <img
                src={image.image_url}
                alt={image.color_name || product.display_name}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              {product.display_name}
            </h1>

            <p className="mt-2 font-mono text-base text-slate-500">
              {product.crossbar_sku}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                {product.brand_display}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                {product.crossbar_category}
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
                Imported
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              Edit Product
            </button>
            <button className="rounded-lg bg-[#860132] px-4 py-2 text-sm text-white">
              Generate Mockup
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Colors
          </h3>

          <div className="mt-3 flex flex-wrap gap-2">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  selectedColor === color
                    ? "border-[#860132] bg-[#860132] text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="font-semibold">{selectedColor}</h3>
            <p className="text-sm text-slate-500">
              {selectedColorVariants.length} size options available
            </p>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Inventory</th>
                <th className="px-4 py-3">Supplier Cost</th>
                <th className="px-4 py-3">Supplier SKU</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {selectedColorVariants.map((variant) => (
                <tr key={variant.id}>
                  <td className="px-4 py-3 font-semibold">
                    {variant.size_name}
                  </td>
                  <td className="px-4 py-3">
                    {variant.inventory_qty ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    {variant.supplier_price
                      ? `$${Number(variant.supplier_price).toFixed(2)}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {variant.supplier_sku}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}