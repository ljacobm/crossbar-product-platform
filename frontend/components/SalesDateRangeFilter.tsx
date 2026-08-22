"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS: { value: "all" | "this-year" | "custom"; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "this-year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

export default function SalesDateRangeFilter({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeRange = searchParams.get("range") || "all";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  function setRange(range: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    if (range !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  function setCustomDate(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeRange === option.value
                ? "bg-[#860132] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {activeRange === "custom" && (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setCustomDate("from", e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[#860132]"
            />
          </label>
          <label className="flex items-center gap-2">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setCustomDate("to", e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-[#860132]"
            />
          </label>
        </div>
      )}
    </div>
  );
}
