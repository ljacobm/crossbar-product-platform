import StatCard from "@/components/StatCard";
import { formatMoney } from "@/lib/formatMoney";
import type { SalesSummary } from "@/lib/onlineStoreSalesTypes";

export default function SalesSummaryCards({
  summary,
  lifetimePaidOut,
  lifetimeBalanceDue,
  rangeLabel,
  // TEMPORARY, display-only: true for a store that isn't currently run
  // as a fundraiser (see lib/fundraisingDisplayOverrides.ts). Hides the
  // three fundraiser-specific cards only -- no calculation, payout
  // record, or data this component receives is affected. Defaults to
  // false so every other store's cards are completely unchanged.
  hideFundraisingCards = false,
}: {
  summary: SalesSummary;
  lifetimePaidOut: number;
  lifetimeBalanceDue: number;
  rangeLabel: string;
  hideFundraisingCards?: boolean;
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <StatCard title={`Total Sales (${rangeLabel})`} value={formatMoney(summary.totalSales)} />
      {!hideFundraisingCards && (
        <StatCard
          title={`Fundraiser Earned (${rangeLabel})`}
          value={formatMoney(summary.fundraiserEarned)}
          subtitle={`${(summary.fundraiserRate * 100).toFixed(1)}% rate`}
        />
      )}
      {!hideFundraisingCards && (
        <StatCard title="Lifetime Paid Out" value={formatMoney(lifetimePaidOut)} />
      )}
      {!hideFundraisingCards && (
        <StatCard title="Lifetime Balance Due" value={formatMoney(lifetimeBalanceDue)} />
      )}
      <StatCard title={`Total Items (${rangeLabel})`} value={summary.totalItems} />
      <StatCard
        title={`Total Discounts (${rangeLabel})`}
        value={summary.totalDiscounts != null ? formatMoney(summary.totalDiscounts) : "—"}
      />
    </div>
  );
}
