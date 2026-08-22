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

export interface SalesLineItemRow {
  lineItemId: number;
  orderNumber: string | null;
  orderDate: string | null;
  title: string | null;
  quantity: number;
  itemNumber: string | null;
  price: number | null;
  totalSalePrice: number;
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
