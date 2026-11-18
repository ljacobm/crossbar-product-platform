"use client";

import { useState } from "react";
import { saveCustomerCatalogDraftSelection } from "@/lib/onlineStoreCatalogCustomerData";
import { getColorSwatchHex } from "@/lib/colorSwatchLogic";
import CatalogProductModal from "@/components/CatalogProductModal";
import type { CatalogStyleOption } from "@/lib/onlineStoreCatalogTypes";

const MAX_PREVIEW_SWATCHES = 5;

function MiniSwatch({ colorName }: { colorName: string }) {
  const hex = getColorSwatchHex(colorName);
  return (
    <span
      title={colorName}
      aria-hidden="true"
      className="inline-block h-5 w-5 rounded-full border border-slate-300"
      style={{ backgroundColor: hex ?? "#e2e8f0" }}
    />
  );
}

// "Selected in your current catalog draft" -- deliberately a strong,
// unambiguous green treatment, distinct from the brand maroon used
// everywhere else, so it never reads as "Approved by Crossbar" (that
// status lives entirely in CatalogReviewPanel's separate "Submission
// Status" section and is never shown on this card).
function SelectedBadge() {
  return (
    <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.792 6.793-6.793a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      Selected
    </span>
  );
}

export default function CatalogStyleCard({
  token,
  style,
  onSelectionChange,
}: {
  token: string;
  style: CatalogStyleOption;
  // Reports the CHANGE in this style's selected-color count (not the
  // new total) so a parent can keep a store-wide running total
  // without needing to track every style's full state itself.
  onSelectionChange?: (delta: number) => void;
}) {
  const [selectedColors, setSelectedColors] = useState(new Set(style.selectedColors));
  const [modalOpen, setModalOpen] = useState(false);

  const isSelected = selectedColors.size > 0;

  // Already-selected colors preview first, so the customer can see
  // what they've picked at a glance without opening the details modal.
  const orderedColors = [...style.availableColors].sort((a, b) => {
    const aSel = selectedColors.has(a) ? 0 : 1;
    const bSel = selectedColors.has(b) ? 0 : 1;
    return aSel - bSel;
  });
  const shownColors = orderedColors.slice(0, MAX_PREVIEW_SWATCHES);
  const extraCount = orderedColors.length - shownColors.length;

  // Diffs the modal's final pending selection against what's actually
  // saved, applies only the changed colors via the existing per-color
  // draft action, and returns false (leaving saved state untouched) if
  // any individual save fails -- the modal stays open and shows an error.
  async function handleSave(newColors: string[]): Promise<boolean> {
    const nextSet = new Set(newColors);
    const toAdd = newColors.filter((c) => !selectedColors.has(c));
    const toRemove = [...selectedColors].filter((c) => !nextSet.has(c));
    const changes = [
      ...toAdd.map((color) => ({ color, selected: true })),
      ...toRemove.map((color) => ({ color, selected: false })),
    ];
    if (changes.length === 0) return true;

    const results = await Promise.all(
      changes.map((c) => saveCustomerCatalogDraftSelection(token, style.approvedCatalogStyleId, c.color, c.selected))
    );
    const ok = results.every((r) => r.ok);
    if (ok) {
      onSelectionChange?.(nextSet.size - selectedColors.size);
      setSelectedColors(nextSet);
    }
    return ok;
  }

  return (
    <>
      <div
        className={`flex h-full flex-col overflow-hidden rounded-xl shadow transition ${
          isSelected ? "border-2 border-green-500 bg-green-50" : "border-2 border-transparent bg-white"
        }`}
      >
        {/* Image area stays neutral regardless of selected state --
            requirement 6: apparel colors must read accurately, never
            tinted by the selection treatment. border-2 (vs. the
            previous ring-2) is a true border, but Tailwind's preflight
            sets box-sizing: border-box globally, so it's drawn INSIDE
            the card's existing box rather than adding to its footprint
            -- the grid's column width and the card's outer dimensions
            are unaffected either way. */}
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

        {/* flex-col + flex-1 on this wrapper, and flex-1 again on the
            text block below, means the button always sits flush at the
            bottom of the card regardless of how many lines the product
            name wraps to -- and since CSS Grid stretches every card in
            a row to the row's tallest sibling by default, every card in
            a row ends up the same height with buttons aligned across
            the row, with no fixed/guessed min-height needed anywhere. */}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex-1">
            {isSelected && <SelectedBadge />}

            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{style.brandDisplay ?? "—"}</p>
            {/* Category and style code are deliberately NOT shown here --
                task requirement: keep the card to brand/name/colors/action
                only. The style code is still available (and still
                searchable) via CatalogProductModal and the underlying
                CatalogStyleOption data -- this only changes what's
                rendered on the card. Up to 3 lines (line-clamp-3) at
                every width, per task requirement -- the full name is
                always shown, unclipped, inside the modal. */}
            <h3 className="mt-0.5 line-clamp-3 font-semibold text-slate-900">{style.displayName}</h3>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {shownColors.length === 0 ? (
                <p className="text-xs text-slate-400">No colors available.</p>
              ) : (
                <>
                  {shownColors.map((c) => (
                    <MiniSwatch key={c} colorName={c} />
                  ))}
                  {extraCount > 0 && <span className="text-xs text-slate-500">+{extraCount} more colors</span>}
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              isSelected
                ? "border-green-600 bg-green-600 text-white hover:bg-green-700"
                : "border-[#860132] text-[#860132] hover:bg-[#860132]/5"
            }`}
          >
            {isSelected ? "Edit Selection" : "Select Product"}
          </button>
        </div>
      </div>

      {modalOpen && (
        <CatalogProductModal
          style={style}
          selectedColors={Array.from(selectedColors)}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
