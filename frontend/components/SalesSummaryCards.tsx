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
  // Column count adapts to how many cards are actually visible, so a
  // store with fundraising cards hidden gets three full-width cards
  // instead of three narrow ones stranded in a 6-column grid. StatCard
  // (components/StatCard.tsx) is shared by unrelated dashboards
  // elsewhere in the app, so its own text size is never changed here --
  // this only ever adjusts THIS grid's own breakpoints. The 6-card case
  // waits until xl (not lg) to go to 6 columns specifically so a
  // 4-digit currency value like $3,459.72 always has a comfortably wide
  // column to render in, never a cramped one right at the desktop
  // breakpoint's minimum width.
  const gridClassName = hideFundraisingCards
    ? "mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3"
    : "mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6";

  return (
    <div className={gridClassName}>
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
