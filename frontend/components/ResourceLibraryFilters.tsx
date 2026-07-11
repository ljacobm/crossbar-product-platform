"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RESOURCE_TYPES, RESOURCE_STATUSES } from "@/lib/resourceOptions";

export default function ResourceLibraryFilters({ departments }: { departments: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    router.push(`/operations/resources?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setQuery(value);
    updateParam("q", value);
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by title, summary, department, or type…"
          className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#860132] focus:ring-2 focus:ring-[#860132]/20"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <select
          value={searchParams.get("type") || ""}
          onChange={(e) => updateParam("type", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">All Types</option>
          {RESOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          value={searchParams.get("status") || ""}
          onChange={(e) => updateParam("status", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">All Statuses</option>
          {RESOURCE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          value={searchParams.get("department") || ""}
          onChange={(e) => updateParam("department", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">All Departments</option>
          {departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>

        <select
          value={searchParams.get("active") || "active"}
          onChange={(e) => updateParam("active", e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>

        <button
          type="button"
          onClick={() => router.push("/operations/resources")}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
