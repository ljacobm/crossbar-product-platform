import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";

export default function DashboardPage() {
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Open Production Jobs" value={0} />
              <StatCard title="Active Team Stores" value={0} />
              <StatCard title="Pending Quotes" value={0} />
              <StatCard title="Maintenance Due" value={0} />
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
