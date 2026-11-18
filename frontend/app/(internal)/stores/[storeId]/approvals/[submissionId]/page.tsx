import { getCatalogSubmissionWithItems } from "@/lib/onlineStoreCatalogBuilderData";
import CatalogSubmissionItemRow from "@/components/CatalogSubmissionItemRow";

export default async function StoreApprovalDetailPage({
  params,
}: {
  params: Promise<{ storeId: string; submissionId: string }>;
}) {
  const { storeId, submissionId } = await params;
  const id = Number(storeId);
  const submission = await getCatalogSubmissionWithItems(Number(submissionId));

  if (!submission) {
    return <div className="rounded-xl bg-white p-6 shadow">Submission not found.</div>;
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Submission #{submission.id}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {submission.status.replace(/_/g, " ")}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Submitted {new Date(submission.submittedAt).toLocaleString()}
        {submission.submittedBy ? ` by ${submission.submittedBy}` : ""}
      </p>

      <ul className="mt-4">
        {submission.items.map((item) => (
          <CatalogSubmissionItemRow key={item.id} storeId={id} submissionId={submission.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
