"use client";

import { useEffect, useRef, useState } from "react";
import SwatchDot from "@/components/SwatchDot";
import type { CatalogStyleOption } from "@/lib/onlineStoreCatalogTypes";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.792 6.793-6.793a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// The modal's own border/ring treatment on top of SwatchDot's shared
// image/hex/gray rendering -- "currently previewed" gets the brand
// ring, everything else gets a plain border. See SwatchDot.tsx's own
// docstring for the full display-priority chain.
function ModalSwatchDot({ colorName, swatchUrl, isPreviewed }: { colorName: string; swatchUrl?: string; isPreviewed: boolean }) {
  return (
    <SwatchDot
      colorName={colorName}
      swatchUrl={swatchUrl}
      className={`h-5 w-5 border-2 ${isPreviewed ? "border-[#860132] ring-2 ring-[#860132]/25" : "border-slate-300"}`}
    />
  );
}

// Two FULLY INDEPENDENT interactions per color, per task requirement:
// clicking the swatch/name previews that color's image only (never
// touches the pending selection), and the checkbox is the only control
// that selects/deselects it. Two different colors encode two different
// facts, deliberately not reused for both: maroon (swatch ring + bold
// name) marks "this is what the big image is currently showing," green
// (checkbox + row tint) marks "this color is in your current
// selection" -- matching the green = "in your draft" convention
// already established on the catalog cards. In readOnly mode there is
// no checkbox at all (a plain checkmark badge substitutes, read-only),
// so staff can preview colors with zero path to ever writing a
// selection.
function ColorRow({
  colorName,
  swatchUrl,
  isPreviewed,
  isSelected,
  readOnly,
  disabled,
  onPreview,
  onToggleSelect,
}: {
  colorName: string;
  swatchUrl?: string;
  isPreviewed: boolean;
  isSelected: boolean;
  readOnly: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 transition ${
        isSelected ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={onPreview}
        title={`Preview ${colorName}`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left"
      >
        <ModalSwatchDot colorName={colorName} swatchUrl={swatchUrl} isPreviewed={isPreviewed} />
        <span className={`truncate text-sm ${isPreviewed ? "font-semibold text-[#860132]" : "text-slate-700"}`}>
          {colorName}
        </span>
      </button>

      {readOnly ? (
        isSelected && (
          <span
            aria-label="Selected"
            title="Selected"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
          >
            <CheckIcon />
          </span>
        )
      ) : (
        <label
          className="flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center"
          title={isSelected ? `Remove ${colorName} from selection` : `Select ${colorName}`}
        >
          <input
            type="checkbox"
            checked={isSelected}
            disabled={disabled}
            onChange={onToggleSelect}
            aria-label={isSelected ? `Remove ${colorName} from selection` : `Select ${colorName}`}
            className="h-5 w-5 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-600 disabled:cursor-not-allowed"
          />
        </label>
      )}
    </div>
  );
}

// Shared by the customer catalog (interactive) and the staff preview
// (readOnly) -- exactly the same product details/colors a customer
// would see either way, never a second drifting implementation.
// Mutation (onSave) stays entirely the caller's responsibility: this
// component only collects a pending color selection and hands the
// final array back on "Save Selection."
export default function CatalogProductModal({
  style,
  selectedColors,
  onClose,
  onSave,
  readOnly = false,
}: {
  style: CatalogStyleOption;
  selectedColors: string[];
  onClose: () => void;
  onSave?: (colors: string[]) => Promise<boolean>;
  readOnly?: boolean;
}) {
  const [pending, setPending] = useState(new Set(selectedColors));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Image preview is intentionally separate from the selection state
  // above -- "clicking a color in staff preview may change the
  // displayed image but must never save selections," and even for
  // customers a click both previews AND toggles selection without one
  // driving the other's bookkeeping. Starts on the last already-saved
  // color so returning customers immediately see what they picked.
  const [displayColor, setDisplayColor] = useState<string | null>(selectedColors[selectedColors.length - 1] ?? null);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Fully independent of toggleSelectColor below -- never touches
  // `pending`. Works identically in readOnly mode, so staff can flip
  // through photos with zero path to ever writing a selection.
  function previewColor(color: string) {
    setImageFailed(false);
    setDisplayColor(color);
  }

  // Fully independent of previewColor above -- never touches
  // `displayColor`, so checking/unchecking a color can never change
  // which photo is showing, and only ever flips THIS ONE color's own
  // membership in `pending` (a Set rebuilt from the previous Set, so
  // no other color's selection state is ever touched).
  function toggleSelectColor(color: string) {
    if (readOnly || isSaving) return;
    setError(null);
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });
  }

  async function handleSave(colors: string[]) {
    if (!onSave) return;
    setIsSaving(true);
    setError(null);
    const ok = await onSave(colors);
    setIsSaving(false);
    if (ok) {
      onClose();
    } else {
      setError("Couldn't save your selection -- please try again.");
    }
  }

  const hasExistingSelection = selectedColors.length > 0;

  // Reliable match only: an exact color_name lookup against this
  // style's own color_name -> image_url map (built from
  // product_images, which shares the same color_name text domain as
  // product_variants -- confirmed against live MAIN data, not a
  // fragile guess). No match -> the default product photo, never a
  // guessed substitute. A failed image load (network/CDN hiccup) also
  // falls back the same way via imageFailed.
  const colorImageUrl = displayColor ? style.colorImages[displayColor] : undefined;
  const effectiveImageUrl = !imageFailed && colorImageUrl ? colorImageUrl : style.heroImageUrl;
  const isColorSpecificImage = !imageFailed && !!colorImageUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-product-modal-title"
        className="flex h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:h-auto sm:max-h-[88vh] sm:max-w-4xl sm:rounded-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            {readOnly && (
              <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Staff preview — read only
              </span>
            )}
            <h2 id="catalog-product-modal-title" className="text-lg font-semibold text-slate-900">
              {style.displayName}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-2">
            <div>
              <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-100">
                {effectiveImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={effectiveImageUrl}
                    src={effectiveImageUrl}
                    alt={displayColor ? `${style.displayName} in ${displayColor}` : style.displayName}
                    className="h-full w-full object-contain"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <span className="text-5xl">👕</span>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                {isColorSpecificImage && displayColor
                  ? `Showing: ${displayColor}`
                  : displayColor
                    ? `No photo available for ${displayColor} -- showing the default photo`
                    : "Default photo"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{style.brandDisplay ?? "—"}</p>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
                {style.crossbarCategory && <span>{style.crossbarCategory}</span>}
                <span className="font-mono text-slate-400">#{style.styleCode}</span>
              </div>
              {(style.gender || style.ageGroup) && (
                <p className="mt-1 text-sm text-slate-500">{[style.gender, style.ageGroup].filter(Boolean).join(" / ")}</p>
              )}

              {style.descriptionHtml && (
                <div
                  className="prose-sm mt-3 max-w-none text-sm text-slate-600 [&_*]:text-sm"
                  dangerouslySetInnerHTML={{ __html: style.descriptionHtml }}
                />
              )}

              <p className="mt-4 text-sm">
                <span className="font-semibold text-slate-700">Available sizes: </span>
                {style.availableSizes.length > 0 ? style.availableSizes.join(", ") : "Not specified"}
              </p>

              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  {readOnly ? "Available colors" : "Select colors"}
                  {!readOnly && pending.size > 0 && (
                    <span className="ml-1.5 font-normal text-green-700">— {pending.size} selected</span>
                  )}
                </p>
                <p className="mb-2 text-xs text-slate-400">
                  {readOnly ? "Tap a color to preview its photo." : "Tap a color to preview it; check the box to select it."}
                </p>
                {style.availableColors.length === 0 ? (
                  <p className="text-sm text-slate-400">No colors available.</p>
                ) : (
                  // Single column on narrow phones (requirement: "for
                  // narrow phones, use a single-column color list if
                  // two columns become cramped") -- a color name plus
                  // swatch plus a 44px checkbox target is tight in two
                  // columns below 640px, especially for longer SanMar
                  // color names ("Graphite Heather", "Antique Cherry
                  // Red"). Two columns from sm: (640px) up, where the
                  // modal itself has more width to work with.
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {style.availableColors.map((color) => (
                      <ColorRow
                        key={color}
                        colorName={color}
                        swatchUrl={style.colorSwatchUrls[color]}
                        isPreviewed={displayColor === color}
                        isSelected={pending.has(color)}
                        readOnly={readOnly}
                        disabled={isSaving}
                        onPreview={() => previewColor(color)}
                        onToggleSelect={() => toggleSelectColor(color)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-shrink-0 flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            {hasExistingSelection ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave([])}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                Remove from Selection
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2 sm:ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave(Array.from(pending))}
                className="rounded-lg bg-[#860132] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Selection"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
