"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPayout, type PayoutFormState } from "@/lib/onlineStorePayoutActions";
import { formatMoney } from "@/lib/formatMoney";
import type { Payout } from "@/lib/onlineStoreSalesTypes";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SubmitPayoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Payout"}
    </button>
  );
}

const initialState: PayoutFormState = { error: null };

export default function PayoutsSection({
  storeId,
  payouts,
}: {
  storeId: number;
  payouts: Payout[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const action = createPayout.bind(null, storeId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Payouts</h2>
          <p className="text-sm text-slate-500">
            Fundraiser checks and credits issued to this store.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {formOpen ? "Cancel" : "+ Add Payout"}
        </button>
      </div>

      {formOpen && (
        // Keying on payouts.length remounts (and clears) the form after a
        // successful submission adds a new row, without needing manual
        // state tracking of "did this submission just succeed."
        <form
          key={payouts.length}
          action={formAction}
          className="mb-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
        >
          {state.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
              {state.error}
            </p>
          )}

          <label className="text-sm text-slate-600">
            Date
            <input
              type="date"
              name="payout_date"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#860132]"
            />
          </label>

          <label className="text-sm text-slate-600">
            Amount
            <input
              type="number"
              name="amount"
              step="0.01"
              min="0"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#860132]"
            />
          </label>

          <label className="text-sm text-slate-600">
            Payment Type
            <input
              type="text"
              name="payment_type"
              placeholder="Check, Venmo, Zelle..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#860132]"
            />
          </label>

          <label className="text-sm text-slate-600">
            Reference
            <input
              type="text"
              name="reference"
              placeholder="Check #1316"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#860132]"
            />
          </label>

          <label className="text-sm text-slate-600 sm:col-span-2">
            Notes
            <textarea
              name="notes"
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#860132]"
            />
          </label>

          <div className="flex justify-end sm:col-span-2">
            <SubmitPayoutButton />
          </div>
        </form>
      )}

      {payouts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No payouts recorded yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Payment Type / Reference</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {payouts.map((payout) => (
                <tr key={payout.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{formatDate(payout.payoutDate)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {formatMoney(payout.amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {[payout.paymentType, payout.reference].filter(Boolean).join(" / ") || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{payout.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
