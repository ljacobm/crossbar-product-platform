"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  BestSellerRow,
  DateRange,
  Payout,
  SalesLineItemRow,
  StoreSalesData,
} from "@/lib/onlineStoreSalesTypes";

// Server-only read path for a single store's Shopify sales data. This and
// onlineStorePayoutActions.ts are the only two files that import
// supabaseAdmin for this feature, per the same "use server"-only rule
// established for online_stores in onlineStoreData.ts. Every function here
// is scoped to one online_store_id -- there is no "all stores" query
// anywhere in this module, so a UI bug can't accidentally leak
// cross-store data.
//
// Fields are hand-picked per query: customer name/email/phone/address,
// raw Shopify payloads, and webhook internals are never selected here, not
// filtered out after the fact.

const BEST_SELLERS_LIMIT = 10;

type RawLineItemRow = {
  id: number;
  title: string | null;
  quantity: number | null;
  item_number: string | null;
  price: number | null;
  shopify_product_id: number | null;
  order: {
    order_number: string | null;
    order_created_at: string | null;
    cancelled_at: string | null;
  } | null;
};

function toNumber(value: number | string | null): number {
  if (value == null) return 0;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function withinRange(orderDate: string | null, range: DateRange): boolean {
  if (range.option === "all") return true;
  if (!orderDate) return false;

  const date = orderDate.slice(0, 10); // compare on the date portion only
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

// Fetches every non-cancelled line item ever recorded for this store, with
// just enough order context (number, date) to build the detailed table --
// then derives both the lifetime figures (needed for the fundraiser
// balance, which is never date-filtered -- see the plan's date-range
// section) and the range-scoped figures from that single result set. This
// avoids a second "lifetime totals" query: at current scale (low hundreds
// of line items even for the busiest store) fetching once and deriving
// everything in memory is simpler and cheaper than querying twice.
export async function getStoreSalesData(
  storeId: number,
  fundraiserRate: number,
  range: DateRange
): Promise<StoreSalesData> {
  const { data, error } = await supabaseAdmin
    .from("shopify_order_line_items")
    .select(
      `
      id, title, quantity, item_number, price, shopify_product_id,
      order:shopify_orders!inner ( order_number, order_created_at, cancelled_at )
      `
    )
    .eq("online_store_id", storeId)
    .is("order.cancelled_at", null);

  if (error) {
    throw new Error(`Failed to load sales data for store ${storeId}: ${error.message}`);
  }

  const rows = (data as unknown as RawLineItemRow[]) ?? [];

  let lifetimeTotalSales = 0;
  for (const row of rows) {
    lifetimeTotalSales += toNumber(row.price) * toNumber(row.quantity);
  }

  const scopedRows = rows.filter((row) => withinRange(row.order?.order_created_at ?? null, range));

  let totalSales = 0;
  let totalItems = 0;
  const bestSellerMap = new Map<number, { title: string; itemsSold: number }>();

  for (const row of scopedRows) {
    const quantity = toNumber(row.quantity);
    const price = toNumber(row.price);
    totalSales += price * quantity;
    totalItems += quantity;

    if (row.shopify_product_id != null) {
      const existing = bestSellerMap.get(row.shopify_product_id);
      if (existing) {
        existing.itemsSold += quantity;
      } else {
        bestSellerMap.set(row.shopify_product_id, {
          title: row.title || "Untitled product",
          itemsSold: quantity,
        });
      }
    }
  }

  const lineItems: SalesLineItemRow[] = scopedRows
    .map((row) => ({
      lineItemId: row.id,
      orderNumber: row.order?.order_number ?? null,
      orderDate: row.order?.order_created_at ?? null,
      title: row.title,
      quantity: toNumber(row.quantity),
      itemNumber: row.item_number,
      price: row.price != null ? toNumber(row.price) : null,
      totalSalePrice: toNumber(row.price) * toNumber(row.quantity),
    }))
    .sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? ""));

  const bestSellers: BestSellerRow[] = Array.from(bestSellerMap.entries())
    .map(([shopifyProductId, { title, itemsSold }]) => ({ shopifyProductId, title, itemsSold }))
    .sort((a, b) => b.itemsSold - a.itemsSold)
    .slice(0, BEST_SELLERS_LIMIT);

  return {
    summary: {
      totalSales,
      totalItems,
      fundraiserRate,
      fundraiserEarned: totalSales * fundraiserRate,
      lifetimeFundraiserEarned: lifetimeTotalSales * fundraiserRate,
    },
    lineItems,
    bestSellers,
  };
}

export async function getStorePayouts(storeId: number): Promise<Payout[]> {
  const { data, error } = await supabaseAdmin
    .from("online_store_payouts")
    .select("id, payout_date, amount, payment_type, reference, notes")
    .eq("online_store_id", storeId)
    .order("payout_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to load payouts for store ${storeId}: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    payoutDate: row.payout_date,
    amount: toNumber(row.amount),
    paymentType: row.payment_type,
    reference: row.reference,
    notes: row.notes,
  }));
}
