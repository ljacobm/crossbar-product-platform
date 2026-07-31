"use client";

import Link from "next/link";
import { useState } from "react";

const COMMON_VIEWS = [
  { label: "Needs Review", href: "/products?view=review" },
  { label: "Approved Catalog", href: "/products?view=approved" },
  { label: "Website Ready", href: "/products?view=website-ready" },
  { label: "Team Store Ready", href: "/products?view=team-store-ready" },
  { label: "Crossbar Products", href: "/products?source=crossbar" },
  { label: "Bundles", href: "/products?source=bundle" },
  { label: "Supplier Products", href: "/products?source=supplier" },
];

export default function CommonViewsMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Common Views ▾
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {COMMON_VIEWS.map((view) => (
              <Link
                key={view.href}
                href={view.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {view.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
