"use client";

import { useState } from "react";
import CatalogStyleCard from "@/components/CatalogStyleCard";
import CatalogSubmitBar from "@/components/CatalogSubmitBar";
import ProductPagination from "@/components/ProductPagination";
import type { CatalogStyleOption } from "@/lib/onlineStoreCatalogTypes";

// Owns the live "N selected" count across the whole page (grid +
// submit bar), since that count is store-wide -- not just the current
// page's styles -- and must update immediately when a modal save
// changes a style's colors, without a full page reload. Starts from
// the server-computed total (workspace.selectedCount, true as of this
// request) and only ever applies the DELTA each card reports, so it
// stays correct without re-deriving the whole store's state client-side.
export default function CatalogStyleGrid({
  token,
  styles,
  initialSelectedCount,
  pagination,
}: {
  token: string;
  styles: CatalogStyleOption[];
  initialSelectedCount: number;
  pagination: {
    basePath: string;
    page: number;
    total: number;
    pageSize: number;
    preservedParams: Record<string, string | string[] | undefined>;
  };
}) {
  const [selectedCount, setSelectedCount] = useState(initialSelectedCount);

  function handleSelectionChange(delta: number) {
    setSelectedCount((count) => Math.max(0, count + delta));
  }

  return (
    <>
      {styles.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow">
          No products match your filters right now.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6">
          {styles.map((style) => (
            <CatalogStyleCard
              key={style.approvedCatalogStyleId}
              token={token}
              style={style}
              onSelectionChange={handleSelectionChange}
            />
          ))}
        </div>
      )}

      <ProductPagination {...pagination} />

      {/* Reserves space for CatalogSubmitBar below, which is
          fixed-positioned (not in normal flow) -- without this, the
          fixed bar would cover the last row of cards/pagination on
          pages short enough not to need scrolling. Matches the bar's
          own safe-area-aware bottom padding so the reserved space is
          always at least as tall as the bar actually renders. */}
      <div style={{ height: "calc(5.5rem + env(safe-area-inset-bottom))" }} aria-hidden="true" />

      <CatalogSubmitBar token={token} selectedCount={selectedCount} />
    </>
  );
}
