import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  BestSellerRow,
  DateRange,
  Payout,
  SalesLineItemDiscount,
  SalesLineItemRow,
  StoreSalesData,
} from "@/lib/onlineStoreSalesTypes";

// Phase 4D, Slice 3: the actual query + calculation logic behind the
// Sales dashboard, extracted unchanged out of lib/onlineStoreSalesData.ts
// so both the staff-facing path (getStoreSalesData/getStorePayouts,
// still requireStaffSession()-gated) and the new customer-portal path
// (lib/customerPortalSalesData.ts, token-gated) can call the exact same
// calculations without duplicating them.
//
// This file deliberately has NO "use server" directive. A "use server"
// file's every real export becomes a publicly-callable Server Action
// RPC endpoint -- fine for getStoreSalesData/getStorePayouts themselves
// (they're meant to be called that way, from Server Components, behind
// requireStaffSession()), but wrong for these lower-level helpers: they
// have no authorization check of their own (by design -- the caller is
// responsible for having already authorized the request, whether via
// staff session or a validated portal token), so they must never be
// independently reachable. `server-only` still guards this module from
// ever being imported into client-bundled code; it just doesn't carry
// the additional "becomes an RPC" behavior that "use server" would add.
//
// Every query, column selection, and calculation below is copied
// verbatim from the original getStoreSalesData/getStorePayouts bodies --
// no logic changed. In particular: cancelled-order exclusion, the
// line-item-only totals (shopify_orders.total_price is never read),
// and the "lifetime figures are never date-filtered" behavior for the
// fundraiser balance are all preserved exactly.
//
// Staff-facing discount display (added on top of the above, unchanged
// logic): shopify_orders.total_discounts and shopify_order_discounts are
// read ONLY to attach order-level display fields onto each
// SalesLineItemRow below (discountTotal/discountCodes) -- never inside
// the totalSales/totalItems/bestSellerMap loop above, and never summed
// across an order's multiple line-item rows. Both reads are optional
// fields on SalesLineItemRow (see its own comment), so the customer
// portal's separate CustomerLineItem type and toCustomerSalesData()
// allowlist mapper (lib/customerPortalSalesData.ts) are structurally
// untouched -- these new fields simply never reach that mapper.

const BEST_SELLERS_LIMIT = 10;

type RawLineItemRow = {
  id: number;
  title: string | null;
  quantity: number | null;
  item_number: string | null;
  price: number | null;
  shopify_product_id: number | null;
  order: {
    id: number;
    order_number: string | null;
    order_created_at: string | null;
    cancelled_at: string | null;
    total_discounts: number | string | null;
  } | null;
};

type RawOrderDiscountRow = {
  order_id: number;
  application_index: number | null;
  application_type: string | null;
  code: string | null;
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
export async function buildStoreSalesData(
  storeId: number,
  fundraiserRate: number,
  range: DateRange
): Promise<StoreSalesData> {
  const { data, error } = await supabaseAdmin
    .from("shopify_order_line_items")
    .select(
      `
      id, title, quantity, item_number, price, shopify_product_id,
      order:shopify_orders!inner ( id, order_number, order_created_at, cancelled_at, total_discounts )
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

  // Discount display data: order-level only (shopify_orders.total_discounts,
  // shopify_order_discounts), fetched for the distinct set of orders
  // actually displayed (scopedRows) and attached per row below for
  // DISPLAY ONLY -- never read by totalSales/totalItems/bestSellerMap
  // above, and never summed across a single order's multiple line-item
  // rows. See SalesLineItemRow's own comment in onlineStoreSalesTypes.ts.
  //
  // discountTotal comes from the main order query above (row.order.
  // total_discounts) and is therefore completely unaffected by whether
  // this secondary lookup succeeds -- it is set per row in the lineItems
  // map below regardless of discountLookupSucceeded.
  //
  // This lookup is deliberately NOT allowed to throw: it is a display-only
  // enhancement, not essential data, so a failure here must never prevent
  // the rest of the Sales Data page (or the customer portal, which shares
  // this function) from rendering. The error is logged for visibility,
  // and discountLookupSucceeded tracks whether the lookup actually ran to
  // completion -- when it didn't, every row's discountCodes is left
  // `undefined` ("unknown"), never `[]` ("confirmed zero"), so a failed
  // lookup can never be displayed as a confirmed absence of a discount.
  // See SalesLineItemRow's own comment in onlineStoreSalesTypes.ts for the
  // full three-state contract this preserves.
  const scopedOrderIds = Array.from(
    new Set(scopedRows.map((row) => row.order?.id).filter((id): id is number => id != null))
  );

  const discountsByOrderId = new Map<number, SalesLineItemDiscount[]>();
  let discountLookupSucceeded = true;
  if (scopedOrderIds.length > 0) {
    try {
      const { data: discountRows, error: discountError } = await supabaseAdmin
        .from("shopify_order_discounts")
        .select("order_id, application_index, application_type, code")
        .in("order_id", scopedOrderIds)
        .order("application_index", { ascending: true });

      if (discountError) {
        throw new Error(discountError.message);
      }

      for (const row of (discountRows as unknown as RawOrderDiscountRow[]) ?? []) {
        const existing = discountsByOrderId.get(row.order_id) ?? [];
        existing.push({ code: row.code, applicationType: row.application_type ?? "discount_code" });
        discountsByOrderId.set(row.order_id, existing);
      }
    } catch (err) {
      discountLookupSucceeded = false;
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to load order discounts for store ${storeId} (sales data still renders without discount detail): ${message}`);
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
      discountTotal: row.order?.total_discounts != null ? toNumber(row.order.total_discounts) : null,
      discountCodes: discountLookupSucceeded
        ? row.order?.id != null
          ? discountsByOrderId.get(row.order.id) ?? []
          : []
        : undefined,
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

export async function buildStorePayouts(storeId: number): Promise<Payout[]> {
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
