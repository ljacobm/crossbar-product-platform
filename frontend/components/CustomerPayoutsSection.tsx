import { formatMoney } from "@/lib/formatMoney";
import type { CustomerPayoutRow } from "@/lib/customerPortalSalesData";

// Phase 4D, Slice 3: read-only payout history for the customer portal.
// A separate component from components/PayoutsSection.tsx, not a
// variant of it -- PayoutsSection bundles the staff-only "Add Payout"
// form (a write action) with its table; the portal must be strictly
// read-only, and reusing that component would mean either shipping the
// write form to customers or threading a bundle of "hide the form"
// props through it. A plain Server Component with no interactivity
// (no "use client", no state, no action) is both simpler and more
// obviously safe to audit. Deliberately has no `notes` column --
// CustomerPayoutRow has no notes field to render in the first place.
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CustomerPayoutsSection({ payouts }: { payouts: CustomerPayoutRow[] }) {
  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-lg font-semibold">Payouts</h2>
      <p className="text-sm text-slate-500">Fundraiser checks and credits issued for this store.</p>

      {payouts.length === 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No payouts recorded yet.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Payment Type / Reference</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
