"use client";

import { useState } from "react";
import { getColorSwatchHex } from "@/lib/colorSwatchLogic";

// Shared rendering logic for a single color's small preview dot --
// extracted out of CatalogProductModal.tsx so the catalog grid
// (CatalogPreviewCard.tsx) and the product detail modal render colors
// identically instead of maintaining two copies of the same
// image/hex/gray fallback chain.
//
// Display priority: (1) the official SanMar swatch image
// (product_images, image_type='swatch' -- resolved and verified
// entirely server-side before ever reaching this component; see
// sanmar_api/sync_sanmar_color_swatches.py) (2) the existing static
// name->hex table (lib/colorSwatchLogic.ts) (3) the existing
// neutral-gray dot. A swatch image that fails to actually load in the
// browser (network hiccup, or SanMar's own 200-OK "unavailable"
// placeholder slipping through) falls back to the SAME hex/gray chain
// live, via onError -- it never shows a broken image icon.
//
// className lets each caller control sizing/border/ring (the modal's
// "currently previewed" ring vs. the grid card's plain border)
// without this component needing to know about either caller's own
// visual conventions.
export default function SwatchDot({
  colorName,
  swatchUrl,
  className = "h-5 w-5 border-2 border-slate-300",
}: {
  colorName: string;
  swatchUrl?: string;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const hex = getColorSwatchHex(colorName);
  const showImage = !!swatchUrl && !imgFailed;

  return (
    <span
      title={colorName}
      aria-hidden="true"
      className={`inline-block flex-shrink-0 overflow-hidden rounded-full ${className}`}
      style={showImage ? undefined : { backgroundColor: hex ?? "#e2e8f0" }}
    >
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={swatchUrl} alt="" className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
      )}
    </span>
  );
}
