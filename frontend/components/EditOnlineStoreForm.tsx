"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateOnlineStore,
  type OnlineStoreFormState,
} from "@/app/(internal)/stores/[storeId]/overview/edit/actions";
import type { OnlineStore } from "@/lib/onlineStoreTypes";

const initialState: OnlineStoreFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[#860132] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}

export default function EditOnlineStoreForm({ store }: { store: OnlineStore }) {
  const updateWithId = updateOnlineStore.bind(null, store.id);
  const [state, formAction] = useActionState(updateWithId, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Store Name</label>
        <input
          type="text"
          name="name"
          required
          defaultValue={store.name}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">
          Changing the name does not change the store&apos;s slug ({store.slug ?? "-"}).
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Vendor / Team Tag
          </label>
          <input
            type="text"
            name="vendor_team_tag"
            defaultValue={store.vendor_team_tag ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Must exactly match the Shopify Vendor &quot;team tag&quot; portion on this
            store&apos;s orders, including capitalization and spacing -- matching is
            case-sensitive and exact.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Fundraiser Rate (%)
          </label>
          <input
            type="number"
            name="fundraiser_rate_percent"
            min={0}
            max={100}
            step="0.01"
            defaultValue={store.fundraiser_rate * 100}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">0 to 100, inclusive.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Organization Type
          </label>
          <input
            type="text"
            name="organization_type"
            defaultValue={store.organization_type ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Sport</label>
          <input
            type="text"
            name="sport"
            defaultValue={store.sport ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Contact Name</label>
          <input
            type="text"
            name="contact_name"
            defaultValue={store.contact_name ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Contact Email</label>
          <input
            type="email"
            name="contact_email"
            defaultValue={store.contact_email ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Contact Phone</label>
          <input
            type="tel"
            name="contact_phone"
            defaultValue={store.contact_phone ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Internal Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={store.notes ?? ""}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
        <a
          href={`/stores/${store.id}/overview`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        <SubmitButton />
      </div>
    </form>
  );
}
