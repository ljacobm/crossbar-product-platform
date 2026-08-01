import Link from "next/link";
import { COLLECTION_ELIGIBLE_VIEWS, type CollectionEligibleView } from "@/lib/catalogViews";

const VIEW_LABELS: Record<CollectionEligibleView, string> = {
  approved: "Approved Catalog",
  "website-ready": "Website Ready",
  "team-store-ready": "Team Store Ready",
};

const EXTRA_PRESETS = [
  { label: "Youth", href: (base: string) => `${base}?ageGroup=Youth&youthOnly=true` },
  { label: "Crossbar Products", href: (base: string) => `${base}?source=crossbar` },
  { label: "Bundles", href: (base: string) => `${base}?source=bundle` },
  { label: "Supplier Products", href: (base: string) => `${base}?source=supplier` },
];

export default function CollectionSelectorPresets({
  collectionId,
  activeView,
  activeSource,
  activeYouthOnly,
}: {
  collectionId: number;
  activeView: CollectionEligibleView;
  activeSource: string;
  activeYouthOnly: boolean;
}) {
  const basePath = `/collections/${collectionId}/products/add`;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        {COLLECTION_ELIGIBLE_VIEWS.map((view) => {
          const isActive = activeView === view && !activeYouthOnly && !activeSource;
          const href = view === "approved" ? basePath : `${basePath}?workflowView=${view}`;

          return (
            <Link
              key={view}
              href={href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-[#860132] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {VIEW_LABELS[view]}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {EXTRA_PRESETS.map((preset) => {
          const isActive =
            (preset.label === "Youth" && activeYouthOnly) ||
            (preset.label === "Crossbar Products" && activeSource === "crossbar") ||
            (preset.label === "Bundles" && activeSource === "bundle") ||
            (preset.label === "Supplier Products" && activeSource === "supplier");

          return (
            <Link
              key={preset.label}
              href={preset.href(basePath)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? "border-[#860132] bg-[#860132] text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {preset.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
