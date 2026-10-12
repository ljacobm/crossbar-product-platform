import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolvePortalStoreId, recordPortalAccess } from "@/lib/portalAccess";
import { isPortalGenerationEnabled, isStoreAllowedForPilot } from "@/lib/portalFeatureFlag";
import { buildStoreSalesData, buildStorePayouts } from "@/lib/salesCalculations";
import type { DateRange, StoreSalesData } from "@/lib/onlineStoreSalesTypes";

// Phase 4D, Slice 3: the customer portal's single data entry point.
// Deliberately NOT a "use server" file, for the same reason as
// lib/portalAccess.ts -- this must never become an independently
// callable Server Action.
//
// Authorization model: the raw token is the ONLY credential. This
// function takes a token (and a date range, which is a display
// parameter, not an authorization one) and internally resolves the
// store id -- it never accepts a caller-supplied store id. There is no
// parameter here or anywhere in this module a page could pass a
// different store's id through, by construction.
//
// isPortalGenerationEnabled() (lib/portalFeatureFlag.ts) is checked
// first, before even attempting to resolve the token: the same flag
// that gates staff-side link generation also gates whether the portal
// route serves real data at all. This is a second, independent reason
// the portal isn't usable before explicit approval -- even if a valid
// token somehow existed (it can't yet, since generation has never been
// enabled), the route would still refuse to serve until the flag is on.
//
// Phase 4D, Slice 4A: a second, narrower check, isStoreAllowedForPilot(),
// runs AFTER the token has been resolved to a storeId and BEFORE any
// sales or payout query -- never on a caller-supplied id, only on the
// id this function already derived from the validated token moments
// earlier. This means an existing, otherwise-valid token for a store
// outside the pilot is refused every single time, not just at the
// moment it was issued -- there is no "grandfathering" of a token that
// was valid before the pilot restriction existed or before it changes.
// isStoreAllowedForPilot() already re-checks isPortalGenerationEnabled()
// internally too; keeping the plain check above as well means the
// cheapest possible rejection (no token hash lookup, no access-tracking
// write) still happens first when the feature is entirely off.
//
// Phase 4D, Slice 4A (correction): resolvePortalStoreId() no longer
// records access itself -- it only validates and resolves the token.
// recordPortalAccess(tokenId) is called here, explicitly, only after
// isStoreAllowedForPilot(storeId) has passed. A token that is otherwise
// valid but for a store outside the pilot must never increment
// access_count / update last_accessed_at -- it was never actually
// served any data.

// ---------------------------------------------------------------------
// Customer-facing types -- a deliberate, separate set from
// StoreSalesData/SalesSummary/SalesLineItemRow/BestSellerRow
// (lib/onlineStoreSalesTypes.ts), even though every field below is
// currently identical in name and type to its staff-facing counterpart.
// The point isn't that the shapes differ today -- it's that this file
// owns its own explicit allowlist, reconstructed field-by-field by
// toCustomerSalesData() below, so a future field added to the shared
// staff-facing types (used by the internal Sales page too) can never
// silently flow through to a customer just because the two types
// happen to share a name. Each field below is named directly from the
// approved list, not copied by spreading or casting the source object.
export type CustomerSalesSummary = {
  totalSales: number;
  totalItems: number;
  fundraiserRate: number;
  fundraiserEarned: number;
  lifetimeFundraiserEarned: number;
};

export type CustomerLineItem = {
  lineItemId: number;
  orderNumber: string | null;
  orderDate: string | null;
  title: string | null;
  quantity: number;
  itemNumber: string | null;
  price: number | null;
  totalSalePrice: number;
};

export type CustomerBestSeller = {
  shopifyProductId: number;
  title: string;
  itemsSold: number;
};

export type CustomerSalesData = {
  summary: CustomerSalesSummary;
  lineItems: CustomerLineItem[];
  bestSellers: CustomerBestSeller[];
};

export type CustomerPayoutRow = {
  id: number;
  payoutDate: string;
  amount: number;
  paymentType: string | null;
  reference: string | null;
  // Deliberately no `notes` field -- internal payout notes are excluded
  // by construction, not filtered out after the fact.
};

export type CustomerPortalData = {
  storeName: string;
  salesData: CustomerSalesData;
  payouts: CustomerPayoutRow[];
};

// Explicit allowlist mapper -- no `as` cast, no object spread of the
// source. Every field is named individually on both sides so adding a
// new field to StoreSalesData upstream has no effect here unless this
// function is also deliberately edited to include it.
function toCustomerSalesData(data: StoreSalesData): CustomerSalesData {
  return {
    summary: {
      totalSales: data.summary.totalSales,
      totalItems: data.summary.totalItems,
      fundraiserRate: data.summary.fundraiserRate,
      fundraiserEarned: data.summary.fundraiserEarned,
      lifetimeFundraiserEarned: data.summary.lifetimeFundraiserEarned,
    },
    lineItems: data.lineItems.map((item) => ({
      lineItemId: item.lineItemId,
      orderNumber: item.orderNumber,
      orderDate: item.orderDate,
      title: item.title,
      quantity: item.quantity,
      itemNumber: item.itemNumber,
      price: item.price,
      totalSalePrice: item.totalSalePrice,
    })),
    bestSellers: data.bestSellers.map((row) => ({
      shopifyProductId: row.shopifyProductId,
      title: row.title,
      itemsSold: row.itemsSold,
    })),
  };
}

// Explicit allowlist mapper for payouts -- buildStorePayouts() returns
// `notes`, which must never reach a customer; excluded by construction
// here, not filtered out after the fact.
function toCustomerPayout(payout: {
  id: number;
  payoutDate: string;
  amount: number;
  paymentType: string | null;
  reference: string | null;
}): CustomerPayoutRow {
  return {
    id: payout.id,
    payoutDate: payout.payoutDate,
    amount: payout.amount,
    paymentType: payout.paymentType,
    reference: payout.reference,
  };
}

async function getStoreNameAndRate(
  storeId: number
): Promise<{ name: string; fundraiserRate: number } | null> {
  // online_stores has RLS enabled with zero anon/authenticated policies
  // (Phase B) -- only service_role can read it. Not routed through
  // getOnlineStoreById() (lib/onlineStoreData.ts): that function calls
  // requireStaffSession() as its first statement, which would reject
  // every customer request outright. Authorization here already
  // happened one level up, when the token was resolved -- this is a
  // plain, narrow, customer-safe lookup (name + rate only, nothing else
  // on the row).
  const { data, error } = await supabaseAdmin
    .from("online_stores")
    .select("name, fundraiser_rate")
    .eq("id", storeId)
    .maybeSingle();

  if (error || !data) return null;

  return { name: data.name, fundraiserRate: Number(data.fundraiser_rate) };
}

// Returns null for every failure case -- invalid/unknown/revoked/expired
// token, the feature flag being off, the store being outside the pilot,
// or a missing store -- so the portal page can render one generic
// "unavailable" message without distinguishing why, the same
// non-disclosure principle used throughout this app's auth flows.
export async function getCustomerPortalData(
  rawToken: string,
  range: DateRange
): Promise<CustomerPortalData | null> {
  if (!isPortalGenerationEnabled()) {
    return null;
  }

  const resolved = await resolvePortalStoreId(rawToken);
  if (resolved === null) {
    return null;
  }
  const { storeId, tokenId } = resolved;

  // Pilot restriction: enforced here, on the storeId this function
  // itself just resolved from the token -- never on anything a caller
  // could supply. No sales or payout query has happened yet at this
  // point.
  if (!isStoreAllowedForPilot(storeId)) {
    return null;
  }

  // Access is only ever recorded once every check above has passed --
  // a rejected non-pilot token must never count as a successful portal
  // visit. See resolvePortalStoreId's own comment in portalAccess.ts
  // for why this moved out of that function.
  await recordPortalAccess(tokenId);

  const store = await getStoreNameAndRate(storeId);
  if (!store) {
    return null;
  }

  const [salesData, rawPayouts] = await Promise.all([
    buildStoreSalesData(storeId, store.fundraiserRate, range),
    buildStorePayouts(storeId),
  ]);

  return {
    storeName: store.name,
    salesData: toCustomerSalesData(salesData),
    payouts: rawPayouts.map(toCustomerPayout),
  };
}
