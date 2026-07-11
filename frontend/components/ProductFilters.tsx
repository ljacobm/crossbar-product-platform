"use client";

import { useRouter, useSearchParams } from "next/navigation";

type ProductFiltersProps = {
  brands: string[];
  categories: string[];
};

export default function ProductFilters({
  brands,
  categories,
}: ProductFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    router.push(`/products?${params.toString()}`);
  }

  function updateStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value && value !== "active") {
      params.set("status", value);
    } else {
      params.delete("status");
    }

    router.push(`/products?${params.toString()}`);
  }

  return (
    <div className="mb-6 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
      <select
        value={searchParams.get("status") || "active"}
        onChange={(e) => updateStatus(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
      >
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="all">All</option>
      </select>

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
      <button
        type="button"
        onClick={() => router.push("/products")}
        className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Clear Filters
      </button>
    </div>
  );
}
