"use client";

import { useFormStatus } from "react-dom";

export default function SubmitBundleButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-lg bg-[#860132] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating Package..." : "Create Package"}
    </button>
  );
}
