import Sidebar from "@/components/Sidebar";
import StatCard from "@/components/StatCard";
import ResourceLibraryFilters from "@/components/ResourceLibraryFilters";
import ResourceLibraryList, {
  type ResourceLibraryRow,
} from "@/components/ResourceLibraryList";
import { supabase } from "@/lib/supabase";

export default async function OperationsResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    department?: string;
    active?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q || "";
  const type = params.type || "";
  const status = params.status || "";
  const department = params.department || "";
  const activeFilter = params.active || "active";

  const [totalRes, approvedRes, draftRes, archivedRes, deptRows] = await Promise.all([
    supabase.from("knowledge_resources").select("id", { count: "exact", head: true }),
    supabase
      .from("knowledge_resources")
      .select("id", { count: "exact", head: true })
      .eq("status", "Approved"),
    supabase
      .from("knowledge_resources")
      .select("id", { count: "exact", head: true })
      .eq("status", "Draft"),
    supabase
      .from("knowledge_resources")
      .select("id", { count: "exact", head: true })
      .eq("status", "Archived"),
    supabase.from("knowledge_resources").select("department").not("department", "is", null),
  ]);

  const departments = Array.from(
    new Set(
      (deptRows.data || [])
        .map((row) => row.department as string | null)
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  let query = supabase
    .from("knowledge_resources")
    .select(
      `
      id,
      resource_type,
      title,
      summary,
      department,
      version,
      status,
      active,
      updated_at,
      linked:product_resource_links(count)
      `,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (activeFilter === "active") {
    query = query.eq("active", true);
  } else if (activeFilter === "archived") {
    query = query.eq("active", false);
  }

  if (type) {
    query = query.eq("resource_type", type);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (department) {
    query = query.eq("department", department);
  }

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `title.ilike.%${escaped}%,summary.ilike.%${escaped}%,department.ilike.%${escaped}%,resource_type.ilike.%${escaped}%`
    );
  }

  const { data, count } = await query;

  type RawRow = {
    id: number;
    resource_type: string;
    title: string;
    summary: string | null;
    department: string | null;
    version: string | null;
    status: string;
    active: boolean;
    updated_at: string;
    linked: { count: number }[] | null;
  };

  const resources: ResourceLibraryRow[] = ((data as unknown as RawRow[]) ?? []).map((row) => ({
    id: row.id,
    resource_type: row.resource_type,
    title: row.title,
    summary: row.summary,
    department: row.department,
    version: row.version,
    status: row.status,
    active: row.active,
    updated_at: row.updated_at,
    linkedCount: row.linked?.[0]?.count ?? 0,
  }));

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-slate-500">Operations</p>
                <h1 className="text-2xl font-bold">Knowledge & SOP Library</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Create and manage reusable SOPs, templates, checklists, documents, and
                  training resources.
                </p>
              </div>

              <a
                href="/operations/resources/new"
                className="flex-shrink-0 rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                New Resource
              </a>
            </div>
          </header>

          <div className="p-8">
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Total Resources" value={totalRes.count ?? 0} />
              <StatCard title="Approved" value={approvedRes.count ?? 0} />
              <StatCard title="Draft" value={draftRes.count ?? 0} />
              <StatCard title="Archived" value={archivedRes.count ?? 0} />
            </div>

            <div className="rounded-xl bg-white p-6 shadow">
              <ResourceLibraryFilters departments={departments} />

              <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Showing {resources.length} of {count ?? 0} resources
                </span>
                <span>Sorted by last updated</span>
              </div>

              <ResourceLibraryList resources={resources} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
