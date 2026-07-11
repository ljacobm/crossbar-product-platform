export const RESOURCE_TYPES = [
  "SOP",
  "Cut Template",
  "Artwork Template",
  "QC Checklist",
  "Document",
  "Video",
  "Machine Setup",
  "Other",
] as const;

export const RESOURCE_STATUSES = ["Draft", "Review", "Approved", "Archived"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const RESOURCE_TYPE_ICONS: Record<string, string> = {
  SOP: "📋",
  "Cut Template": "✂️",
  "Artwork Template": "🎨",
  "QC Checklist": "✅",
  Document: "📄",
  Video: "🎬",
  "Machine Setup": "⚙️",
  Other: "📁",
};
