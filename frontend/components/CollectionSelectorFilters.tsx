"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function CollectionSelectorFilters({
  collectionId,
  brands,
  categories,
  ageGroups,
}: {
  collectionId: number;
  brands: string[];
  categories: string[];
  ageGroups: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = `/collections/${collectionId}/products/add`;

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    params.delete("page");
    router.push(`${basePath}?${params.toString()}`);
  }

  function toggleYouthOnly(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());

    if (checked) {
      params.set("youthOnly", "true");
    } else {
      params.delete("youthOnly");
    }

    params.delete("page");
    router.push(`${basePath}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(basePath);
  }

  const youthOnly = searchParams.get("youthOnly") === "true";

  return (
    <div className="mb-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <select
          value={searchParams.get("brand") || ""}
          onChange={(e) => updateFilter("brand", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">All Brands</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>

        <select
          value={searchParams.get("category") || ""}
          onChange={(e) => updateFilter("category", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          value={searchParams.get("source") || ""}
          onChange={(e) => updateFilter("source", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">All Sources</option>
          <option value="supplier">Supplier</option>
          <option value="crossbar">Crossbar</option>
          <option value="bundle">Bundle</option>
        </select>

        <select
          value={searchParams.get("ageGroup") || ""}
          onChange={(e) => updateFilter("ageGroup", e.target.value)}
          disabled={ageGroups.length === 0}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">All Ages</option>
          {ageGroups.map((ageGroup) => (
            <option key={ageGroup} value={ageGroup}>
              {ageGroup}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={clearFilters}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear Filters
        </button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={youthOnly}
          onChange={(e) => toggleYouthOnly(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Title contains &ldquo;Youth&rdquo;
        <span className="text-xs text-slate-400">
          (fallback — most products don&apos;t have structured age-group data yet)
        </span>
      </label>
    </div>
  );
}
