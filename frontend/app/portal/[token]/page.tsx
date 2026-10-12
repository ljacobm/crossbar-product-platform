import SalesDateRangeFilter from "@/components/SalesDateRangeFilter";
import SalesSummaryCards from "@/components/SalesSummaryCards";
import BestSellersTable from "@/components/BestSellersTable";
import SalesLineItemsTable from "@/components/SalesLineItemsTable";
import CustomerPayoutsSection from "@/components/CustomerPayoutsSection";
import { getCustomerPortalData } from "@/lib/customerPortalSalesData";
import type { DateRange } from "@/lib/onlineStoreSalesTypes";

// Phase 4D, Slice 3: customer-facing read-only sales portal. Outside
// app/(internal)/ by design -- no staff session exists for a visitor
// here, no Sidebar/internal navigation is imported, and proxy.ts treats
// /portal as a public path prefix (same list as /login, /auth/callback,
// /api/webhooks/shopify) for exactly that reason.
//
// Explicitly forced dynamic: this page reads a bearer-token-gated
// financial result that must never be served from a cache, on top of
// the blanket Cache-Control: no-store header already applied to every
// route in next.config.ts. Belt and suspenders, not redundant -- the
// header controls downstream/browser caching; this controls whether
// Next's own render pipeline could ever treat this route as static.
export const dynamic = "force-dynamic";

function resolveDateRange(searchParams: {
  range?: string;
  from?: string;
  to?: string;
}): { range: DateRange; label: string } {
  // Deliberately duplicated from app/(internal)/stores/[storeId]/sales/page.tsx
  // rather than extracted into a shared module: it's small, pure,
  // UI-param-parsing only (no data access, no security implication), and
  // duplicating it means this slice never has to touch the existing,
  // already-approved internal Sales page file at all -- "preserve the
  // existing staff Sales page behavior exactly" is satisfied by not
  // going near it, not just by not changing its behavior.
  const option =
    searchParams.range === "this-year" || searchParams.range === "custom"
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

function PortalHeader({ storeName }: { storeName?: string }) {
  return (
    <header className="border-b border-slate-200 bg-white px-6 py-5 sm:px-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#860132]">
        Crossbar Athletics
      </p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">
        {storeName ? `${storeName} — Fundraiser Dashboard` : "Fundraiser Dashboard"}
      </h1>
    </header>
  );
}

// Generic, non-disclosing unavailable state -- shown identically whether
// the token is malformed, unknown, revoked, expired, or the portal
// feature flag is off. No reason is ever distinguished in the response.
function UnavailableLinkPage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <PortalHeader />
      <div className="mx-auto max-w-lg px-6 py-16 text-center sm:px-10">
        <h2 className="text-lg font-semibold text-slate-900">This link isn&apos;t available</h2>
        <p className="mt-2 text-sm text-slate-600">
          This portal link is invalid, has been disabled, or has expired. Please contact your
          Crossbar Athletics team store coordinator for an updated link.
        </p>
      </div>
    </main>
  );
}

export default async function CustomerPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { token } = await params;
  const resolvedSearchParams = await searchParams;
  const { range, label } = resolveDateRange(resolvedSearchParams);

  const data = await getCustomerPortalData(token, range);

  if (!data) {
    return <UnavailableLinkPage />;
  }

  const { storeName, salesData, payouts } = data;
  const lifetimePaidOut = payouts.reduce((sum, payout) => sum + payout.amount, 0);
  const lifetimeBalanceDue = salesData.summary.lifetimeFundraiserEarned - lifetimePaidOut;

  return (
    <main className="min-h-screen bg-slate-100">
      <PortalHeader storeName={storeName} />

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8 sm:px-10">
        <SalesDateRangeFilter basePath={`/portal/${token}`} />

        <SalesSummaryCards
          summary={salesData.summary}
          lifetimePaidOut={lifetimePaidOut}
          lifetimeBalanceDue={lifetimeBalanceDue}
          rangeLabel={label}
        />

        <p className="text-xs text-slate-400">
          Totals exclude cancelled orders. Partial refunds are not currently deducted from these
          figures.
        </p>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Best Selling Products</h2>
          <BestSellersTable bestSellers={salesData.bestSellers} />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Detailed Sales</h2>
          <SalesLineItemsTable lineItems={salesData.lineItems} />
        </div>

        <CustomerPayoutsSection payouts={payouts} />
      </div>
    </main>
  );
}
