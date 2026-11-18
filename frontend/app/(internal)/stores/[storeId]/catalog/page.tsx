import Link from "next/link";
import { getOnlineStoreCatalogBaseline, listCatalogSubmissionsForStore } from "@/lib/onlineStoreCatalogBuilderData";
import { getStoreDraftItemCount } from "@/lib/onlineStoreCatalogCustomerData";
import { getCatalogAccessLinkStatus } from "@/app/(internal)/stores/[storeId]/catalogAccessActions";
import CatalogAccessLinkSection from "@/components/CatalogAccessLinkSection";

export default async function StoreCatalogPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const id = Number(storeId);

  const [baseline, linkStatus, draftItemCount, submissions] = await Promise.all([
    getOnlineStoreCatalogBaseline(id),
    getCatalogAccessLinkStatus(id),
    getStoreDraftItemCount(id),
    listCatalogSubmissionsForStore(id),
  ]);

  // 'partially_approved' is terminal (every item already decided,
  // mixed outcome) -- only 'pending' still needs staff attention.
  const pendingSubmissions = submissions.filter((s) => s.status === "pending");

  return (
    <div className="space-y-6">
      <CatalogAccessLinkSection storeId={id} initialStatus={linkStatus} />

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Draft &amp; Submission Status</h2>
            <p className="mt-1 text-sm text-slate-500">
              What the customer is currently working on, right now.
            </p>
          </div>
          <Link
            href={`/stores/${id}/catalog/preview`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Preview Customer Catalog ↗
          </Link>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">In Draft</dt>
            <dd className="mt-1 text-2xl font-semibold text-slate-900">{draftItemCount}</dd>
            <p className="text-xs text-slate-500">Colors currently selected by the customer, not yet submitted.</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending Review</dt>
            <dd className="mt-1 text-2xl font-semibold text-slate-900">{pendingSubmissions.length}</dd>
            <p className="text-xs text-slate-500">
              Submissions awaiting Crossbar approval.{" "}
              {pendingSubmissions.length > 0 && (
                <Link href={`/stores/${id}/approvals`} className="text-[#860132] hover:underline">
                  Review now
                </Link>
              )}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Approved Live</dt>
            <dd className="mt-1 text-2xl font-semibold text-slate-900">{baseline.length}</dd>
            <p className="text-xs text-slate-500">Colors currently live in this store&apos;s customer catalog.</p>
          </div>
        </dl>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">Approved Catalog ({baseline.length})</h2>
        <p className="mt-1 text-sm text-slate-500">
          Styles and colors currently approved and live for this store&apos;s customer catalog.
          Changes come from the Approvals tab -- this list is read-only here.
        </p>

        {baseline.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Nothing approved yet. Once customers submit selections and Crossbar approves them, they
            will appear here.
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Style</th>
                <th className="py-2">Color</th>
                <th className="py-2">Approved</th>
                <th className="py-2">Shopify Status</th>
              </tr>
            </thead>
            <tbody>
              {baseline.map((item, index) => (
                <tr key={`${item.approvedCatalogStyleId}-${item.colorName}-${index}`} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{item.displayName}</td>
                  <td className="py-2 text-slate-700">{item.colorName}</td>
                  <td className="py-2 text-slate-500">
                    {new Date(item.approvedAt).toLocaleDateString()} {item.approvedBy ? `by ${item.approvedBy}` : ""}
                  </td>
                  <td className="py-2 text-slate-700">{item.shopifyPublishStatus.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
