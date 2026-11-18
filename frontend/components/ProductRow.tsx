"use client";

import { useState, useTransition } from "react";
import WorkflowStatusBadge from "@/components/WorkflowStatusBadge";
import { removeCatalogProductFromTeamStores } from "@/lib/approvedCatalogStyleData";

type CatalogSettingsRow = {
  workflow_status: string;
  website_ready?: boolean;
  team_store_enabled?: boolean;
};

type Product = {
  id: number;
  crossbar_sku: string;
  display_name: string;
  crossbar_category: string | null;
  brand_display: string | null;
  active: boolean;
  source_type: string;
  age_group?: string | null;
  gender?: string | null;
  product_images: {
    id: number;
    image_url: string;
    color_name: string | null;
    image_type?: string;
    active?: boolean;
    sort_order: number | null;
  }[];
  catalog_settings?: CatalogSettingsRow | CatalogSettingsRow[] | null;
};

function selectThumbnail(images: Product["product_images"]) {
  const active = images.filter((image) => image.active !== false);
  const hero = active.find((image) => image.image_type === "hero");
  if (hero) return hero;

  // Never fall back to a swatch-type row here -- a tiny 35x35 SanMar
  // color swatch gif must never be stretched into this list
  // thumbnail's slot just because it happens to sort first. Swatches
  // and product photos are kept logically separate everywhere in this
  // codebase purely by this image_type check; this is the staff
  // Catalog Manager's own equivalent of the same guard already applied
  // in lib/onlineStoreCatalogCustomerData.ts's buildCatalogWorkspace().
  const nonSwatch = active.filter((image) => image.image_type !== "swatch");

  return [...nonSwatch].sort(
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

function resolveSettings(product: Product): CatalogSettingsRow {
  const settings = product.catalog_settings;
  if (!settings) return { workflow_status: "Imported" };
  const row = Array.isArray(settings) ? settings[0] : settings;
  return row || { workflow_status: "Imported" };
}

export default function ProductRow({
  product,
  selected,
  onToggleSelect,
  disableRowNavigation = false,
  approvedCatalogStyleIds,
}: {
  product: Product;
  selected?: boolean;
  onToggleSelect?: () => void;
  disableRowNavigation?: boolean;
  // Team Store Ready tab ONLY -- see app/(internal)/products/page.tsx
  // and components/ProductTable.tsx. Every other caller of ProductRow
  // (the main Catalog Manager on any other view, and the Collection
  // product picker via CollectionProductSelectorTable.tsx) never
  // passes this prop, so the "Remove from Team Stores" button below
  // never renders for them -- this is the only thing distinguishing
  // "team-store-ready" row rendering from every other view, by design.
  approvedCatalogStyleIds?: number[];
}) {
  const thumbnail = selectThumbnail(product.product_images ?? []);
  const settings = resolveSettings(product);
  const [isPending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function handleRemoveFromTeamStores() {
    if (!approvedCatalogStyleIds || approvedCatalogStyleIds.length === 0) return;
    setConfirmRemove(false);
    setRemoveError(null);
    startTransition(async () => {
      try {
        await removeCatalogProductFromTeamStores(approvedCatalogStyleIds);
      } catch (err) {
        setRemoveError(err instanceof Error ? err.message : "Failed to remove.");
      }
    });
  }

  return (
    <tr
      className={
        disableRowNavigation
          ? "transition hover:bg-slate-50"
          : "cursor-pointer transition hover:bg-slate-50"
      }
      onClick={() => {
        if (disableRowNavigation) return;
        window.location.href = `/products/${product.id}`;
      }}
    >
      {onToggleSelect && (
        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={onToggleSelect}
            aria-label={`Select ${product.display_name}`}
            className="h-4 w-4 rounded border-slate-300"
          />
        </td>
      )}

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
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge active={product.active} sourceType={product.source_type} />
          <WorkflowStatusBadge status={settings.workflow_status} />
          {settings.website_ready && (
            <span
              title="Website Ready"
              aria-label="Website Ready"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-50 text-sm"
            >
              🌐
            </span>
          )}
          {settings.team_store_enabled && (
            <span
              title="Enabled for Team Stores"
              aria-label="Enabled for Team Stores"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-sm"
            >
              🏬
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-4 text-right" onClick={(e) => approvedCatalogStyleIds && e.stopPropagation()}>
        <div className="flex items-center justify-end gap-2">
          {approvedCatalogStyleIds && approvedCatalogStyleIds.length > 0 && (
            <div className="text-left">
              {removeError && <p className="mb-1 text-xs text-red-600">{removeError}</p>}
              {confirmRemove ? (
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleRemoveFromTeamStores}
                    className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isPending ? "Removing..." : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setConfirmRemove(true)}
                  title="Removes this product's eligibility for future customer team store selections only -- does not archive or change the underlying product."
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Remove from Team Stores
                </button>
              )}
            </div>
          )}

          {disableRowNavigation ? (
            <a
              href={`/products/${product.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open product in a new tab"
              aria-label={`Open ${product.display_name} in a new tab`}
              className="text-sm text-slate-400 hover:text-[#860132]"
            >
              ↗
            </a>
          ) : (
            <span className="text-lg text-slate-400">›</span>
          )}
        </div>
      </td>
    </tr>
  );
}

export type { Product };
