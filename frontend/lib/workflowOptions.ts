export const WORKFLOW_STATUSES = [
  "Imported",
  "Reviewing",
  "Approved",
  "Website Ready",
  "Archived",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export const WORKFLOW_STATUS_STYLES: Record<WorkflowStatus, string> = {
  Imported: "bg-gray-100 text-gray-600",
  Reviewing: "bg-amber-50 text-amber-700",
  Approved: "bg-blue-50 text-blue-700",
  "Website Ready": "bg-green-50 text-green-700",
  Archived: "bg-slate-200 text-slate-500",
};
