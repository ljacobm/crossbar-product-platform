"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createOnlineStore,
  type OnlineStoreFormState,
} from "@/app/(internal)/stores/new/actions";

const initialState: OnlineStoreFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[#860132] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating Store..." : "Create Store"}
    </button>
  );
}

export default function AddOnlineStoreForm() {
  const [state, formAction] = useActionState(createOnlineStore, initialState);
  const values = state?.values;

  // Keying the form on the echoed-back values forces React to remount
  // the (uncontrolled) inputs below with fresh defaultValues whenever a
  // new failed submission comes back with different content -- an
  // uncontrolled input's defaultValue is only applied at mount time, so
  // without this key a validation/collision error would otherwise clear
  // the form instead of preserving what staff typed.
  const formKey = values ? JSON.stringify(values) : "initial";

  return (
    <form key={formKey} action={formAction} className="space-y-6">
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
          defaultValue={values?.name ?? ""}
          placeholder="Lakeside Lacrosse"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Vendor / Team Tag
          </label>
          <input
            type="text"
            name="vendor_team_tag"
            defaultValue={values?.vendorTeamTag ?? ""}
            placeholder="Lakeside Lacrosse"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Must exactly match the Shopify Vendor &quot;team tag&quot; portion on this
            store&apos;s orders, including capitalization and spacing -- matching is
            case-sensitive and exact. Leave blank if not set up in Shopify yet; it
            can be added or changed later.
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
            defaultValue={values?.fundraiserRatePercent || 20}
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
            defaultValue={values?.organizationType ?? ""}
            placeholder="School, Club, Nonprofit..."
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Sport</label>
          <input
            type="text"
            name="sport"
            defaultValue={values?.sport ?? ""}
            placeholder="Lacrosse"
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Contact Name</label>
          <input
            type="text"
            name="contact_name"
            defaultValue={values?.contactName ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Contact Email</label>
          <input
            type="email"
            name="contact_email"
            defaultValue={values?.contactEmail ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Contact Phone</label>
          <input
            type="tel"
            name="contact_phone"
            defaultValue={values?.contactPhone ?? ""}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Internal Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={values?.notes ?? ""}
          placeholder="Staff-only context. Never shown to a customer."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
        <a
          href="/stores"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>

        <SubmitButton />
      </div>
    </form>
  );
}
