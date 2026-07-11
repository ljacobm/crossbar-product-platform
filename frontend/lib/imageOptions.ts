export const IMAGE_TYPES = ["hero", "gallery", "detail", "lifestyle", "mockup"] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

// Selectable in the uploader's per-file type dropdown. Hero is set via a
// separate toggle instead, so it isn't offered as a plain type choice.
export const ASSIGNABLE_IMAGE_TYPES = IMAGE_TYPES.filter(
  (type) => type !== "hero"
) as Exclude<ImageType, "hero">[];

export const IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  hero: "Hero Image",
  gallery: "Gallery",
  detail: "Detail Images",
  lifestyle: "Lifestyle / In-Game",
  mockup: "Mockups",
};

export const MAX_IMAGE_FILE_SIZE = 6 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const STORAGE_BUCKET = "product-images";
