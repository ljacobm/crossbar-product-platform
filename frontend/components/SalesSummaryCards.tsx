import StatCard from "@/components/StatCard";
import { formatMoney } from "@/lib/formatMoney";
import type { SalesSummary } from "@/lib/onlineStoreSalesTypes";

export default function SalesSummaryCards({
  summary,
  lifetimePaidOut,
  lifetimeBalanceDue,
  rangeLabel,
}: {
  summary: SalesSummary;
  lifetimePaidOut: number;
  lifetimeBalanceDue: number;
  rangeLabel: string;
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <StatCard title={`Total Sales (${rangeLabel})`} value={formatMoney(summary.totalSales)} />
      <StatCard
        title={`Fundraiser Earned (${rangeLabel})`}
        value={formatMoney(summary.fundraiserEarned)}
        subtitle={`${(summary.fundraiserRate * 100).toFixed(1)}% rate`}
      />
      <StatCard title="Lifetime Paid Out" value={formatMoney(lifetimePaidOut)} />
      <StatCard title="Lifetime Balance Due" value={formatMoney(lifetimeBalanceDue)} />
      <StatCard title={`Total Items (${rangeLabel})`} value={summary.totalItems} />
      <StatCard
        title={`Total Discounts (${rangeLabel})`}
        value={summary.totalDiscounts != null ? formatMoney(summary.totalDiscounts) : "—"}
      />
    </div>
  );
}
