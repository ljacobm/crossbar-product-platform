import Link from "next/link";
import { RESOURCE_TYPE_ICONS } from "@/lib/resourceOptions";

export type ResourceLibraryRow = {
  id: number;
  resource_type: string;
  title: string;
  summary: string | null;
  department: string | null;
  version: string | null;
  status: string;
  active: boolean;
  updated_at: string;
  linkedCount: number;
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
      className={`inline-flex flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

export default function ResourceLibraryList({
  resources,
}: {
  resources: ResourceLibraryRow[];
}) {
  if (resources.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        No resources match your filters.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {resources.map((resource) => (
        <li key={resource.id}>
          <Link
            href={`/operations/resources/${resource.id}`}
            className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
              {RESOURCE_TYPE_ICONS[resource.resource_type] || "📁"}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{resource.title}</span>
                {resource.version && (
                  <span className="text-xs text-slate-500">v{resource.version}</span>
                )}
                {!resource.active && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    Archived
                  </span>
                )}
              </div>

              {resource.summary && (
                <p className="mt-1 truncate text-sm text-slate-600">{resource.summary}</p>
              )}

              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{resource.resource_type}</span>
                {resource.department && (
                  <>
                    <span>&bull;</span>
                    <span>{resource.department}</span>
                  </>
                )}
                <span>&bull;</span>
                <span>Updated {new Date(resource.updated_at).toLocaleDateString()}</span>
                <span>&bull;</span>
                <span>
                  {resource.linkedCount} linked product{resource.linkedCount === 1 ? "" : "s"}
                </span>
              </p>
            </div>

            <StatusBadge status={resource.status} />

            <span className="flex-shrink-0 text-lg text-slate-400">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
