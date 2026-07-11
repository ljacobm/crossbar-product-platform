"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  uploadProductImages,
  type ImageActionState,
} from "@/app/products/[id]/images/actions";
import {
  ASSIGNABLE_IMAGE_TYPES,
  IMAGE_TYPE_LABELS,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_FILE_SIZE,
} from "@/lib/imageOptions";

const initialState: ImageActionState = { error: null };

type PendingImage = {
  key: string;
  file: File;
  previewUrl: string;
  imageType: string;
  altText: string;
  caption: string;
  isHero: boolean;
  error: string | null;
};

function validateFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return "Unsupported file type. Use JPG, PNG, or WebP.";
  }

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return "File exceeds the 6 MB size limit.";
  }

  return null;
}

export default function ProductImageUploader({ productId }: { productId: number }) {
  const uploadWithId = uploadProductImages.bind(null, productId);
  const [state, formAction, pending] = useActionState(uploadWithId, initialState);

  const [items, setItems] = useState<PendingImage[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasPendingRef = useRef(false);

  // Clear the pending previews only once an in-flight submission finishes
  // successfully (pending: true -> false with no error) — never on mount.
  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) {
      setItems((current) => {
        for (const item of current) {
          URL.revokeObjectURL(item.previewUrl);
        }
        return [];
      });
    }

    wasPendingRef.current = pending;
  }, [pending, state]);

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const newItems: PendingImage[] = Array.from(fileList).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      imageType: "gallery",
      altText: "",
      caption: "",
      isHero: false,
      error: validateFile(file),
    }));

    setItems((current) => [...current, ...newItems]);
    setClientError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeItem(key: string) {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  }

  function updateItem(key: string, patch: Partial<PendingImage>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function toggleHero(key: string) {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        isHero: item.key === key ? !item.isHero : false,
      }))
    );
  }

  function handleUpload() {
    setClientError(null);

    const validItems = items.filter((item) => !item.error);

    if (validItems.length === 0) {
      setClientError("Add at least one valid image to upload.");
      return;
    }

    const heroItem = validItems.find((item) => item.isHero);

    if (heroItem && !heroItem.altText.trim()) {
      setClientError("The image marked as Hero requires alt text.");
      return;
    }

    const fd = new FormData();

    for (const item of validItems) {
      fd.append("files", item.file);
      fd.append("image_type", item.isHero ? "hero" : item.imageType);
      fd.append("alt_text", item.altText.trim());
      fd.append("caption", item.caption.trim());
      fd.append("is_hero", item.isHero ? "true" : "false");
    }

    startTransition(() => {
      formAction(fd);
    });
  }

  return (
    <div className="space-y-5">
      {(state?.error || clientError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state?.error || clientError}
        </p>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Choose Images
        </label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={(e) => handleFilesSelected(e.target.files)}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">
          JPG, PNG, or WebP. Maximum 6 MB per image.
        </p>
      </div>

      {items.length > 0 && (
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.key}
              className={`flex gap-4 rounded-lg border p-4 ${
                item.error ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
              }`}
            >
              <img
                src={item.previewUrl}
                alt=""
                className="h-20 w-20 flex-shrink-0 rounded-lg border border-slate-200 object-contain bg-white p-1"
              />

              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-sm font-medium text-slate-900">
                  {item.file.name}
                </p>

                {item.error ? (
                  <p className="text-xs text-red-700">{item.error}</p>
                ) : (
                  <>
                    <div className="grid gap-2 md:grid-cols-2">
                      <select
                        value={item.imageType}
                        disabled={item.isHero}
                        onChange={(e) => updateItem(item.key, { imageType: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {ASSIGNABLE_IMAGE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {IMAGE_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => toggleHero(item.key)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          item.isHero
                            ? "border-[#860132] bg-[#860132] text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {item.isHero ? "★ Hero Image" : "Set as Hero"}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={item.altText}
                      onChange={(e) => updateItem(item.key, { altText: e.target.value })}
                      placeholder={
                        item.isHero
                          ? "Alt text (required for hero image)"
                          : "Alt text (optional)"
                      }
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${
                        item.isHero && !item.altText.trim()
                          ? "border-red-300"
                          : "border-slate-300"
                      }`}
                    />

                    <input
                      type="text"
                      value={item.caption}
                      onChange={(e) => updateItem(item.key, { caption: e.target.value })}
                      placeholder="Caption (optional)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeItem(item.key)}
                className="flex-shrink-0 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={handleUpload}
          disabled={pending || items.length === 0}
          className="rounded-lg bg-[#860132] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Uploading Images..." : "Upload Images"}
        </button>
      </div>
    </div>
  );
}
