// Shared shapes for the store sales dashboard. Kept in its own plain
// module (no "use server") for the same reason as onlineStoreTypes.ts --
// a "use server" file may only export async functions, not types.

export type DateRangeOption = "all" | "this-year" | "custom";

export interface DateRange {
  option: DateRangeOption;
  from: string | null; // ISO date (YYYY-MM-DD), inclusive
  to: string | null; // ISO date (YYYY-MM-DD), inclusive
}

export interface SalesSummary {
  totalSales: number; // scoped to the selected date range
  totalItems: number; // scoped to the selected date range
  fundraiserRate: number;
  fundraiserEarned: number; // scoped to the selected date range
  lifetimeFundraiserEarned: number; // always lifetime, used for the balance calc
}

// Discount display shape for one order's discount application -- NOT the
// full shopify_order_discounts row, just the fields this table needs to
// label a code vs. an automatic discount. Multiple entries per order are
// expected (preserves applicationIndex order) and are themselves
// order-level, never line-item-level -- see SalesLineItemRow's own
// comment below for why this must never be summed per row.
export interface SalesLineItemDiscount {
  code: string | null;
  applicationType: string; // "automatic" | "discount_code" | "manual" | "script" (raw Shopify value)
}

export interface SalesLineItemRow {
  lineItemId: number;
  orderNumber: string | null;
  orderDate: string | null;
  title: string | null;
  quantity: number;
  itemNumber: string | null;
  price: number | null;
  totalSalePrice: number;
  // Both fields below are ORDER-level, attached identically to every line
  // item row belonging to the same order, for display only -- never read
  // by any summary/total calculation. Optional (not `| null`) so a type
  // lacking them entirely (e.g. the customer portal's CustomerLineItem)
  // still structurally satisfies this interface; see
  // lib/customerPortalSalesData.ts's explicit-allowlist mapper, which
  // this must never bypass.
  //
  // discountTotal: shopify_orders.total_discounts for this row's order.
  // `null` means the column itself is null (genuinely unknown -- not the
  // same as a confirmed $0). In practice every order-write path always
  // populates this field, so `null` should not occur for a real order,
  // but the display layer must not assume that and must never treat it
  // as 0.
  discountTotal?: number | null;
  // discountCodes: shopify_order_discounts for this row's order, in
  // applicationIndex order. THREE states, same JSON-contract philosophy
  // used elsewhere in this codebase for discount data (see
  // buildDiscountsJson in lib/shopifyNormalized.ts):
  //   - `undefined` (the field absent): the shopify_order_discounts
  //     lookup itself failed or never ran for this order -- "no
  //     opinion," never to be read as "confirmed no discount."
  //   - `[]` (present, empty): the lookup succeeded and found zero
  //     discount applications for this order -- a genuine confirmed
  //     absence.
  //   - a populated array: the lookup succeeded and found these
  //     applications, in order.
  discountCodes?: SalesLineItemDiscount[];
}

export interface BestSellerRow {
  shopifyProductId: number;
  title: string;
  itemsSold: number;
}

export interface StoreSalesData {
  summary: SalesSummary;
  lineItems: SalesLineItemRow[];
  bestSellers: BestSellerRow[];
}

export interface Payout {
  id: number;
  payoutDate: string;
  amount: number;
  paymentType: string | null;
  reference: string | null;
  notes: string | null;
}
