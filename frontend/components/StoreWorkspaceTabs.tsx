"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Overview", segment: "overview" },
  { label: "Sales Data", segment: "sales" },
] as const;

export default function StoreWorkspaceTabs({ storeId }: { storeId: number }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 border-b border-slate-200 bg-white px-8">
      {TABS.map((tab) => {
        const href = `/stores/${storeId}/${tab.segment}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={tab.segment}
            href={href}
            className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
              isActive
                ? "border-[#860132] text-[#860132]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
