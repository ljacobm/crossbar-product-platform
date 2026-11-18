import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import { listPendingCatalogSubmissions } from "@/lib/onlineStoreCatalogBuilderData";

export default async function GlobalApprovalsPage() {
  const submissions = await listPendingCatalogSubmissions();

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />
        <section className="flex-1">
          <PageHeader
            title="Approval Queue"
            subtitle="Every online store's pending catalog change requests, across all stores."
          />

          <div className="p-8">
            <div className="rounded-xl bg-white p-6 shadow">
              {submissions.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing pending review.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {submissions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-3">
                      <div>
                        <Link
                          href={`/stores/${s.onlineStoreId}/approvals/${s.id}`}
                          className="font-medium text-[#860132] hover:underline"
                        >
                          {s.onlineStoreName} -- Submission #{s.id}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {new Date(s.submittedAt).toLocaleString()} {s.submittedBy ? `by ${s.submittedBy}` : ""} --{" "}
                          {s.addedCount} added, {s.removedCount} removed, {s.pendingItemCount} pending review
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        {s.status.replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
