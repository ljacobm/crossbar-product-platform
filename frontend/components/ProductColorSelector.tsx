"use client";

import { useMemo, useState } from "react";

type Variant = {
  id: number;
  color_name: string;
  size_name: string;
};

export default function ProductColorSelector({
  variants,
}: {
  variants: Variant[];
}) {
  const colors = useMemo(() => {
    return Array.from(new Set(variants.map((v) => v.color_name))).sort();
  }, [variants]);

  const [selectedColor, setSelectedColor] = useState(colors[0] || "");

  return (
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
  );
}