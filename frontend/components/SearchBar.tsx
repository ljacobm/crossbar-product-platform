"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type SearchBarProps = {
  placeholder?: string;
};

export default function SearchBar({
  placeholder = "Search...",
}: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") || "");

  function handleChange(searchValue: string) {
    setValue(searchValue);

    const params = new URLSearchParams(searchParams.toString());

    if (searchValue.trim()) {
      params.set("q", searchValue);
    } else {
      params.delete("q");
    }

    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="mb-6">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          🔍
        </span>

        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#860132] focus:ring-2 focus:ring-[#860132]/20"
        />
      </div>
    </div>
  );
}