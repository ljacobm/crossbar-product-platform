import Link from "next/link";
import { listCatalogSubmissionsForStore } from "@/lib/onlineStoreCatalogBuilderData";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  partially_approved: "bg-blue-50 text-blue-700",
};

export default async function StoreApprovalsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const id = Number(storeId);
  const submissions = await listCatalogSubmissionsForStore(id);

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold">Catalog Submissions ({submissions.length})</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every change a customer has submitted for review, newest first.
      </p>

      {submissions.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No submissions yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {submissions.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <div>
                <Link href={`/stores/${id}/approvals/${s.id}`} className="font-medium text-[#860132] hover:underline">
                  Submission #{s.id}
                </Link>
                <p className="text-xs text-slate-500">
                  {new Date(s.submittedAt).toLocaleString()} {s.submittedBy ? `by ${s.submittedBy}` : ""} --{" "}
                  {s.addedCount} added, {s.removedCount} removed
                  {s.pendingItemCount > 0 ? `, ${s.pendingItemCount} pending review` : ""}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                {s.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
