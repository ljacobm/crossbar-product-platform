import Link from "next/link";
import { CATALOG_VIEWS, type CatalogViewId } from "@/lib/catalogViews";

export default function CatalogViewTabs({
  activeView,
  counts,
}: {
  activeView: CatalogViewId;
  counts: Record<CatalogViewId, number>;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {CATALOG_VIEWS.map((view) => {
        const isActive = activeView === view.id;
        const href = view.id === "all" ? "/products" : `/products?view=${view.id}`;

        return (
          <Link
            key={view.id}
            href={href}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-[#860132] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {view.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                isActive ? "bg-white/20 text-white" : "bg-white text-slate-500"
              }`}
            >
              {counts[view.id].toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
