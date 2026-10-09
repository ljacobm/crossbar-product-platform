import SalesDateRangeFilter from "@/components/SalesDateRangeFilter";
import SalesSummaryCards from "@/components/SalesSummaryCards";
import BestSellersTable from "@/components/BestSellersTable";
import SalesLineItemsTable from "@/components/SalesLineItemsTable";
import PayoutsSection from "@/components/PayoutsSection";
import { getOnlineStoreById } from "@/lib/onlineStoreData";
import { getStorePayouts, getStoreSalesData } from "@/lib/onlineStoreSalesData";
import type { DateRange } from "@/lib/onlineStoreSalesTypes";

function resolveDateRange(searchParams: {
  range?: string;
  from?: string;
  to?: string;
}): { range: DateRange; label: string } {
  const option = searchParams.range === "this-year" || searchParams.range === "custom"
    ? searchParams.range
    : "all";

  if (option === "this-year") {
    const year = new Date().getFullYear();
    return {
      range: { option, from: `${year}-01-01`, to: `${year}-12-31` },
      label: "This Year",
    };
  }

  if (option === "custom") {
    return {
      range: { option, from: searchParams.from || null, to: searchParams.to || null },
      label: "Custom Range",
    };
  }

  return { range: { option: "all", from: null, to: null }, label: "All Time" };
}

export default async function StoreSalesDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { storeId } = await params;
  const resolvedSearchParams = await searchParams;
  const id = Number(storeId);

  const store = await getOnlineStoreById(id);

  // The parent layout already confirmed this store exists and renders its
  // own not-found UI otherwise -- this page never mounts for a missing
  // store, matching the Overview page's convention.
  if (!store) return null;

  const { range, label } = resolveDateRange(resolvedSearchParams);

  const [salesData, payouts] = await Promise.all([
    getStoreSalesData(store.id, store.fundraiser_rate, range),
    getStorePayouts(store.id),
  ]);

  const lifetimePaidOut = payouts.reduce((sum, payout) => sum + payout.amount, 0);
  const lifetimeBalanceDue = salesData.summary.lifetimeFundraiserEarned - lifetimePaidOut;

  return (
    <div className="space-y-6">
      <SalesDateRangeFilter basePath={`/stores/${store.id}/sales`} />

      <SalesSummaryCards
        summary={salesData.summary}
        lifetimePaidOut={lifetimePaidOut}
        lifetimeBalanceDue={lifetimeBalanceDue}
        rangeLabel={label}
      />

      <p className="text-xs text-slate-400">
        Totals exclude cancelled orders. Partial refunds are not currently deducted from these
        figures -- a known limitation for now.
      </p>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Best Selling Products</h2>
        <BestSellersTable bestSellers={salesData.bestSellers} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Detailed Sales</h2>
        <SalesLineItemsTable lineItems={salesData.lineItems} />
      </div>

      <PayoutsSection storeId={store.id} payouts={payouts} />
    </div>
  );
}
