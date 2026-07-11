"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  archiveKnowledgeResource,
  restoreKnowledgeResource,
  type ResourceFormState,
} from "@/app/operations/resources/actions";

const initialState: ResourceFormState = { error: null };

export default function ResourceViewerActions({
  resourceId,
  active,
}: {
  resourceId: number;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const archiveWithId = archiveKnowledgeResource.bind(null, resourceId);
  const restoreWithId = restoreKnowledgeResource.bind(null, resourceId);

  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveWithId,
    initialState
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    restoreWithId,
    initialState
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex flex-shrink-0 gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
      >
        Print
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          More Actions ▾
        </button>

        {open && (
          <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {active ? (
              <form action={archiveAction}>
                <button
                  type="submit"
                  disabled={archivePending}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {archivePending ? "Archiving..." : "Archive Resource"}
                </button>
              </form>
            ) : (
              <form action={restoreAction}>
                <button
                  type="submit"
                  disabled={restorePending}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {restorePending ? "Restoring..." : "Restore Resource"}
                </button>
              </form>
            )}

            {(archiveState?.error || restoreState?.error) && (
              <p className="mt-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {archiveState?.error || restoreState?.error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
