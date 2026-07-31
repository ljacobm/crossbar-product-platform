type ChecklistItem = {
  label: string;
  done: boolean;
  comingSoon?: boolean;
};

function ChecklistRow({ label, done, comingSoon }: ChecklistItem) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm text-slate-700">{label}</span>
      {comingSoon ? (
        <span className="text-xs font-medium text-slate-400">Coming Soon</span>
      ) : (
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${
            done ? "text-green-700" : "text-slate-400"
          }`}
        >
          {done ? "✓" : "○"} {done ? "Complete" : "Missing"}
        </span>
      )}
    </div>
  );
}

export default function ReadinessChecklist({
  hasHeroImage,
  hasDescription,
  hasCategory,
  hasPricingRule,
  hasResources,
}: {
  hasHeroImage: boolean;
  hasDescription: boolean;
  hasCategory: boolean;
  hasPricingRule: boolean;
  hasResources: boolean;
}) {
  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold">Website Checklist</h2>
      <p className="mt-1 text-sm text-slate-500">
        A quick look at what this product has in place. Display-only for now.
      </p>

      <div className="mt-4">
        <ChecklistRow label="Hero Image" done={hasHeroImage} />
        <ChecklistRow label="Description" done={hasDescription} />
        <ChecklistRow label="Category" done={hasCategory} />
        <ChecklistRow label="Pricing Rule" done={hasPricingRule} />
        <ChecklistRow label="Resources" done={hasResources} />
        <ChecklistRow label="Product Options" done={false} comingSoon />
      </div>
    </div>
  );
}
