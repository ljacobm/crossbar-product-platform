import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import { RESOURCE_TYPE_ICONS } from "@/lib/resourceOptions";
import { sanitizeResourceHtml } from "@/lib/sanitizeHtml";
import ResourceViewerActions from "@/components/ResourceViewerActions";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600",
    Review: "bg-amber-50 text-amber-700",
    Approved: "bg-emerald-50 text-emerald-700",
    Archived: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

export default async function ResourceViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: resource, error } = await supabase
    .from("knowledge_resources")
    .select(
      `
      id,
      resource_type,
      title,
      summary,
      content_html,
      version,
      status,
      file_url,
      external_url,
      slug,
      department,
      owner_name,
      estimated_minutes,
      active,
      updated_at
      `
    )
    .eq("id", id)
    .single();

  if (error || !resource) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <section className="flex-1 p-8">
            <div className="rounded-xl bg-white p-6 shadow">Resource not found.</div>
          </section>
        </div>
      </main>
    );
  }

  type RawLink = {
    id: number;
    product: {
      id: number;
      display_name: string;
      crossbar_sku: string;
      source_type: string;
      active: boolean;
      product_images: { id: number; image_url: string; sort_order: number | null }[];
    } | null;
  };

  const { data: linkedProductsRaw } = await supabase
    .from("product_resource_links")
    .select(
      `
      id,
      product:catalog_products (
        id,
        display_name,
        crossbar_sku,
        source_type,
        active,
        product_images (
          id,
          image_url,
          sort_order
        )
      )
      `
    )
    .eq("resource_id", id)
    .order("id", { ascending: true });

  const linkedProducts = ((linkedProductsRaw as unknown as RawLink[]) ?? []).filter(
    (link) => link.product
  );

  const sanitizedContent = sanitizeResourceHtml(resource.content_html || "");
  const updatedAt = new Date(resource.updated_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const estimatedTimeLabel =
    resource.estimated_minutes != null
      ? resource.estimated_minutes >= 60
        ? `${Math.floor(resource.estimated_minutes / 60)}h ${resource.estimated_minutes % 60}m`
        : `${resource.estimated_minutes} min`
      : null;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <div className="print:hidden">
          <Sidebar />
        </div>

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5 print:hidden">
            <p className="text-sm font-medium text-slate-500">Operations</p>
            <h1 className="text-2xl font-bold">Knowledge & SOP Library</h1>
          </header>

          <div className="p-8">
            <div className="hidden print:mb-6 print:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Crossbar OS / Crossbar Athletics
              </p>
            </div>

            <a
              href="/operations/resources"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 print:hidden"
            >
              <span className="text-lg">←</span>
              Back to Resource Library
            </a>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2xl">
                      {RESOURCE_TYPE_ICONS[resource.resource_type] || "📁"}
                    </span>
                    <h1 className="text-2xl font-bold tracking-tight">{resource.title}</h1>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                      {resource.resource_type}
                    </span>
                    <StatusBadge status={resource.status} />
                    {resource.version && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                        v{resource.version}
                      </span>
                    )}
                    {resource.department && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                        {resource.department}
                      </span>
                    )}
                    {estimatedTimeLabel && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                        ⏱ {estimatedTimeLabel}
                      </span>
                    )}
                    {resource.owner_name && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                        Owner: {resource.owner_name}
                      </span>
                    )}
                    {!resource.active && (
                      <span className="rounded-full bg-gray-200 px-3 py-1 text-sm text-gray-700">
                        Archived
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-shrink-0 gap-2 print:hidden">
                  <Link
                    href={`/operations/resources/${resource.id}/edit`}
                    className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Edit Resource
                  </Link>
                  <ResourceViewerActions resourceId={resource.id} active={resource.active} />
                </div>
              </div>

              <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
                <div className="mx-auto w-full max-w-2xl">
                  {resource.summary && (
                    <p className="mb-6 text-base leading-7 text-slate-600">
                      {resource.summary}
                    </p>
                  )}

                  {sanitizedContent ? (
                    <div
                      className="resource-content"
                      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      No rich content has been added to this resource yet.
                    </p>
                  )}

                  <div className="mt-8 flex flex-wrap gap-3">
                    {resource.file_url && (
                      <>
                        <a
                          href={resource.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
                        >
                          📎 Open Primary File
                        </a>
                        <p className="hidden text-xs text-slate-600 print:block">
                          Primary file: {resource.file_url}
                        </p>
                      </>
                    )}

                    {resource.external_url && (
                      <>
                        <a
                          href={resource.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
                        >
                          🔗 Open External Link / Video
                        </a>
                        <p className="hidden text-xs text-slate-600 print:block">
                          External link: {resource.external_url}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-6 print:hidden">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Details
                    </h3>

                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Type</dt>
                        <dd className="font-medium text-slate-900">
                          {resource.resource_type}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Status</dt>
                        <dd className="font-medium text-slate-900">{resource.status}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Version</dt>
                        <dd className="font-medium text-slate-900">
                          {resource.version || "-"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Department</dt>
                        <dd className="font-medium text-slate-900">
                          {resource.department || "-"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Owner</dt>
                        <dd className="font-medium text-slate-900">
                          {resource.owner_name || "-"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Estimated Time</dt>
                        <dd className="font-medium text-slate-900">
                          {estimatedTimeLabel || "-"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Last Updated</dt>
                        <dd className="font-medium text-slate-900">{updatedAt}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Linked Products ({linkedProducts.length})
                    </h3>

                    {linkedProducts.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        No products currently reference this resource.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {linkedProducts.map((link) => {
                          const product = link.product!;
                          const thumbnail = [...(product.product_images || [])].sort(
                            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
                          )[0];

                          return (
                            <li key={link.id}>
                              <a
                                href={`/products/${product.id}`}
                                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50"
                              >
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                                  {thumbnail ? (
                                    <img
                                      src={thumbnail.image_url}
                                      alt={product.display_name}
                                      className="h-full w-full object-contain p-1"
                                    />
                                  ) : (
                                    <span className="text-sm text-slate-400">🖼️</span>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-slate-900">
                                    {product.display_name}
                                  </p>
                                  <p className="font-mono text-xs text-slate-500">
                                    {product.crossbar_sku}
                                  </p>
                                </div>

                                <span
                                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    product.source_type === "bundle"
                                      ? "bg-amber-50 text-amber-700"
                                      : product.source_type === "crossbar"
                                      ? "bg-purple-50 text-purple-700"
                                      : "bg-blue-50 text-blue-700"
                                  }`}
                                >
                                  {product.source_type === "bundle"
                                    ? "Bundle"
                                    : product.source_type === "crossbar"
                                    ? "Crossbar"
                                    : "Imported"}
                                </span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
