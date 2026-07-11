import { RESOURCE_TYPE_ICONS } from "@/lib/resourceOptions";

export type ProductResource = {
  linkId: number;
  resourceId: number;
  resource_type: string;
  title: string;
  summary: string | null;
  version: string | null;
  status: string;
  file_url: string | null;
  external_url: string | null;
  active: boolean;
  relationship_type: string | null;
  required: boolean;
  notes: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600",
    Review: "bg-amber-50 text-amber-700",
    Approved: "bg-emerald-50 text-emerald-700",
    Archived: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function groupByType(resources: ProductResource[]): [string, ProductResource[]][] {
  const groups = new Map<string, ProductResource[]>();

  for (const resource of resources) {
    const existing = groups.get(resource.resource_type);

    if (existing) {
      existing.push(resource);
    } else {
      groups.set(resource.resource_type, [resource]);
    }
  }

  return Array.from(groups.entries());
}

export default function ProductResourcesSection({
  productId,
  resources,
}: {
  productId: number;
  resources: ProductResource[];
}) {
  const groups = groupByType(resources);

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Related Resources</h2>
        <a
          href={`/products/${productId}/resources`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Manage Resources
        </a>
      </div>

      {resources.length === 0 ? (
        <p className="text-sm text-slate-500">
          No SOPs, templates, checklists, or documents are linked to this product yet.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(([type, items]) => (
            <div key={type}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <span>{RESOURCE_TYPE_ICONS[type] || "📁"}</span>
                {type}
              </h3>

              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                {items.map((resource) => {
                  const openUrl = resource.file_url || resource.external_url;

                  return (
                    <li key={resource.linkId} className="px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`/operations/resources/${resource.resourceId}`}
                              className="font-semibold text-slate-900 hover:underline"
                            >
                              {resource.title}
                            </a>
                            {resource.version && (
                              <span className="text-xs text-slate-500">
                                v{resource.version}
                              </span>
                            )}
                          </div>

                          {resource.summary && (
                            <p className="mt-1 text-sm text-slate-600">{resource.summary}</p>
                          )}

                          {resource.notes && (
                            <p className="mt-1 text-xs italic text-slate-500">
                              Note: {resource.notes}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-2">
                          <StatusBadge status={resource.status} />

                          {resource.required && (
                            <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                              Required
                            </span>
                          )}

                          {openUrl && (
                            <a
                              href={openUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Open
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
