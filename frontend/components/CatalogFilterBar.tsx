"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { CatalogFacetOption, CatalogFacets } from "@/lib/onlineStoreCatalogTypes";

// Customer-facing catalog search/filter/sort sidebar, modeled on the
// main Crossbar website's catalog filters: checkbox groups (multi-
// select, OR within a group) for Product Type / Brand / Gender &amp;
// Age, each collapsible, with a count next to every option. Desktop: a
// left sidebar (the parent page lays it out in a flex row). Mobile:
// starts collapsed behind a "Filters" toggle. Mirrors
// components/ProductFilters.tsx's convention: plain URLSearchParams
// manipulation + router.push, no form library, every change is a full
// navigation (page resets to 1 on any filter/search/sort change,
// intentionally -- a stale page number against a newly narrowed result
// set would be confusing). Multi-select values are repeated query
// params (?category=A&category=B), so a filtered view stays bookmarkable.

// A collapsible checkbox group. Can hold more than one underlying
// filter FIELD at once (e.g. "Gender / Age" visually groups the
// separate gender and ageGroup fields under one header, matching the
// reference site's sidebar grouping) -- each sub-group keeps its own
// paramKey/selected list, so toggling an age-group checkbox can never
// be mistaken for a gender filter or vice versa, even though they
// render side by side.
function FilterSection({
  label,
  groups,
  onToggle,
}: {
  label: string;
  groups: { paramKey: string; options: CatalogFacetOption[]; selected: string[] }[];
  onToggle: (paramKey: string, value: string) => void;
}) {
  const totalOptions = groups.reduce((n, g) => n + g.options.length, 0);
  if (totalOptions === 0) return null;
  return (
    <details open className="group">
      <summary className="mb-1.5 flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        <span className="text-slate-400 group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-1.5">
        {groups.map((g) =>
          g.options.map((opt) => (
            <label
              key={`${g.paramKey}:${opt.value}`}
              className="flex min-h-[2.75rem] cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={g.selected.includes(opt.value)}
                  onChange={() => onToggle(g.paramKey, opt.value)}
                  className="h-5 w-5 flex-shrink-0 rounded border-slate-300 text-[#860132] focus:ring-[#860132]"
                />
                {opt.value}
              </span>
              <span className="text-xs text-slate-400">{opt.count}</span>
            </label>
          ))
        )}
      </div>
    </details>
  );
}

export default function CatalogFilterBar({ facets }: { facets: CatalogFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  function updateParams(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page"); // any filter/search/sort change resets to page 1
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleMultiParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll(key);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    params.delete(key);
    for (const v of next) params.append(key, v);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const selectedCategories = searchParams.getAll("category");
  const selectedBrands = searchParams.getAll("brand");
  const selectedGenders = searchParams.getAll("gender");
  const selectedAgeGroups = searchParams.getAll("ageGroup");

  const activeFilterCount =
    (searchParams.get("q") ? 1 : 0) +
    selectedCategories.length +
    selectedBrands.length +
    selectedGenders.length +
    selectedAgeGroups.length;
  const hasAnyFilter = activeFilterCount > 0;

  const body = (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
        <input
          type="text"
          defaultValue={searchParams.get("q") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParams({ q: e.currentTarget.value });
          }}
          placeholder="Name, brand, or style code..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sort</label>
        <select
          defaultValue={searchParams.get("sort") ?? "name-asc"}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="name-asc">Name (A-Z)</option>
          <option value="brand-asc">Brand</option>
          <option value="category-asc">Product Type</option>
          <option value="newest">Newest Additions</option>
        </select>
      </div>

      <FilterSection
        label="Product Type"
        groups={[{ paramKey: "category", options: facets.categories, selected: selectedCategories }]}
        onToggle={toggleMultiParam}
      />

      <FilterSection
        label="Brand"
        groups={[{ paramKey: "brand", options: facets.brands, selected: selectedBrands }]}
        onToggle={toggleMultiParam}
      />

      <FilterSection
        label="Gender / Age"
        groups={[
          { paramKey: "gender", options: facets.genders, selected: selectedGenders },
          { paramKey: "ageGroup", options: facets.ageGroups, selected: selectedAgeGroups },
        ]}
        onToggle={toggleMultiParam}
      />

      {hasAnyFilter && (
        <button
          type="button"
          onClick={clearFilters}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Clear Filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile/tablet (below lg, where the persistent sidebar is
          hidden): a prominent full-width Filter button opens the exact
          same filter controls in a bottom-sheet drawer, rather than
          pushing content down in-flow -- comfortable touch targets
          throughout (large tap areas, a clear header, and an explicit
          close action), and the drawer reads/writes the same URL
          params as the desktop sidebar, so switching between them
          never loses a selection. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
        >
          <span aria-hidden="true">⚙</span>
          Filters & Sort
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#860132] px-1.5 text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50" onClick={() => setMobileOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Filters and sort"
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl"
            >
              <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-semibold text-slate-900">Filters & Sort</h2>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close filters"
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">{body}</div>

              <div className="flex-shrink-0 border-t border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="w-full rounded-lg bg-[#860132] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  Show Results
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: permanent left sidebar */}
      <aside className="hidden w-64 flex-shrink-0 lg:block">
        <div className="sticky top-6 rounded-xl bg-white p-5 shadow">{body}</div>
      </aside>
    </>
  );
}
