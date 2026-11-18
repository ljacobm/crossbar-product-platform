"use client";

import { useState } from "react";
import SwatchDot from "@/components/SwatchDot";
import CatalogProductModal from "@/components/CatalogProductModal";
import type { CatalogStyleOption } from "@/lib/onlineStoreCatalogTypes";

const MAX_PREVIEW_SWATCHES = 5;

// Same image/hex/gray fallback chain as the product detail modal (see
// SwatchDot.tsx) -- swatchUrl comes from style.colorSwatchUrls, which
// buildCatalogWorkspace() already resolves as part of the SAME query
// this card's own `style` prop comes from, so showing the real
// official swatch here costs no additional database query: it's
// already sitting on the object this component already received. The
// approximate-hex/neutral-gray fallback (inside SwatchDot) is
// unchanged for any color with no swatch row yet.
function MiniSwatch({ colorName, swatchUrl }: { colorName: string; swatchUrl?: string }) {
  return <SwatchDot colorName={colorName} swatchUrl={swatchUrl} className="h-5 w-5 border border-slate-300" />;
}

// Visual parity with CatalogStyleCard's green "Selected" treatment --
// same green, same checkmark. Wording stays "In customer draft" (not
// "Selected") on purpose: this is the STAFF view, where the risk of
// misreading a visual cue as "Approved by Crossbar" is highest, so the
// label keeps saying exactly what style.selectedColors here actually
// means -- the store's current draft (buildCatalogWorkspace, shared
// with the real customer path), never a historical approval.
function InDraftBadge() {
  return (
    <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.792 6.793-6.793a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      In customer draft
    </span>
  );
}

// Staff-only preview card -- clicking opens the SAME
// CatalogProductModal a customer sees, in readOnly mode, so staff can
// inspect full details and colors with no write path existing here at
// all. Mirrors CatalogStyleCard's simplified layout exactly (task
// requirement: "reuse the same simplified cards and product details
// modal").
export default function CatalogPreviewCard({ style }: { style: CatalogStyleOption }) {
  const [modalOpen, setModalOpen] = useState(false);
  const isSelected = style.selectedColors.length > 0;

  const orderedColors = [...style.availableColors].sort((a, b) => {
    const aSel = style.selectedColors.includes(a) ? 0 : 1;
    const bSel = style.selectedColors.includes(b) ? 0 : 1;
    return aSel - bSel;
  });
  const shownColors = orderedColors.slice(0, MAX_PREVIEW_SWATCHES);
  const extraCount = orderedColors.length - shownColors.length;

  return (
    <>
      <div
        className={`flex h-full flex-col overflow-hidden rounded-xl shadow transition ${
          isSelected ? "border-2 border-green-500 bg-green-50" : "border-2 border-transparent bg-white"
        }`}
      >
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex aspect-[4/5] w-full flex-shrink-0 items-center justify-center bg-slate-100"
          title="View product details"
        >
          {style.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={style.heroImageUrl} alt={style.displayName} className="h-full w-full object-contain" />
          ) : (
            <span className="text-4xl">👕</span>
          )}
        </button>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex-1">
            {isSelected && <InDraftBadge />}
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{style.brandDisplay ?? "—"}</p>
            <h3 className="mt-0.5 line-clamp-3 font-semibold text-slate-900">{style.displayName}</h3>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {shownColors.length === 0 ? (
                <p className="text-xs text-slate-400">No colors available.</p>
              ) : (
                <>
                  {shownColors.map((c) => (
                    <MiniSwatch key={c} colorName={c} swatchUrl={style.colorSwatchUrls[c]} />
                  ))}
                  {extraCount > 0 && <span className="text-xs text-slate-500">+{extraCount} more colors</span>}
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Details
          </button>
        </div>
      </div>

      {modalOpen && (
        <CatalogProductModal
          style={style}
          selectedColors={style.selectedColors}
          onClose={() => setModalOpen(false)}
          readOnly
        />
      )}
    </>
  );
}
