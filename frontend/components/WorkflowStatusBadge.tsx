import {
  WORKFLOW_STATUS_STYLES,
  isWorkflowStatus,
  type WorkflowStatus,
} from "@/lib/workflowOptions";

export default function WorkflowStatusBadge({ status }: { status: string }) {
  const label: WorkflowStatus = isWorkflowStatus(status) ? status : "Imported";
  const styles = WORKFLOW_STATUS_STYLES[label];

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
