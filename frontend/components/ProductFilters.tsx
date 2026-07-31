"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { WORKFLOW_STATUSES } from "@/lib/workflowOptions";

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

  const view = searchParams.get("view") || "all";

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    params.delete("page");

    router.push(`/products?${params.toString()}`);
  }

  function updateStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value && value !== "active") {
      params.set("status", value);
    } else {
      params.delete("status");
    }

    params.delete("page");

    router.push(`/products?${params.toString()}`);
  }

  function clearFilters() {
    const params = new URLSearchParams();
    if (view !== "all") params.set("view", view);
    const source = searchParams.get("source");
    if (source) params.set("source", source);

    const qs = params.toString();
    router.push(qs ? `/products?${qs}` : "/products");
  }

  return (
    <div className="mb-6">
      <div
        className={`grid gap-3 ${
          view === "all"
            ? "md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
            : "md:grid-cols-[1fr_1fr_1fr_auto]"
        }`}
      >
        {view === "all" && (
          <select
            value={searchParams.get("status") || "active"}
            onChange={(e) => updateStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        )}

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
          value={searchParams.get("workflow") || ""}
          onChange={(e) => updateFilter("workflow", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">All Workflow</option>
          {WORKFLOW_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
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
    </div>
  );
}
