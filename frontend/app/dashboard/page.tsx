import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { supabase } from "@/lib/supabase";
import { WORKFLOW_STATUSES } from "@/lib/workflowOptions";

const STATUS_VIEW_HREF: Record<string, string> = {
  Imported: "/products?view=review",
  Reviewing: "/products?view=review",
  Approved: "/products?view=approved",
  "Website Ready": "/products?view=website-ready",
  Archived: "/products?view=archived",
};

export default async function DashboardPage() {
  const [counts, teamStoreCount] = await Promise.all([
    Promise.all(
      WORKFLOW_STATUSES.map(async (status) => {
        const { count } = await supabase
          .from("catalog_settings")
          .select("id", { count: "exact", head: true })
          .eq("workflow_status", status);
        return count ?? 0;
      })
    ),
    supabase
      .from("catalog_products")
      .select("id, catalog_settings!inner(team_store_enabled)", { count: "exact", head: true })
      .eq("active", true)
      .eq("catalog_settings.team_store_enabled", true)
      .then((res) => res.count ?? 0),
  ]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <PageHeader
            title="Dashboard"
            subtitle="Crossbar OS company overview."
          />

          <div className="p-8">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {WORKFLOW_STATUSES.map((status, index) => (
                <StatCard
                  key={status}
                  title={status}
                  value={counts[index]}
                  href={STATUS_VIEW_HREF[status]}
                />
              ))}

              <StatCard
                title="Team Store Ready"
                value={teamStoreCount}
                href="/products?view=team-store-ready"
              />
            </div>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <h3 className="text-xl font-semibold">Recent Activity</h3>

              <p className="mt-2 text-sm text-gray-500">
                No recent activity yet.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
