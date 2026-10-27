import { formatMoney } from "@/lib/formatMoney";
import { resolveDiscountDisplayState } from "@/lib/discountDisplayState";
import type { SalesLineItemRow } from "@/lib/onlineStoreSalesTypes";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Renders this order's discount state for the Discount column. The
// actual decision logic (which of the four states applies) lives in
// lib/discountDisplayState.ts, as a plain, directly-testable function --
// this is purely the JSX for each resolved state. ORDER-level labeling
// throughout -- never implies a per-line-item amount, per the "clearly
// label amounts as order-level discounts" requirement.
function renderDiscountCell(row: SalesLineItemRow) {
  const state = resolveDiscountDisplayState(row);

  switch (state.kind) {
    case "codes":
      return (
        <div className="space-y-0.5">
          {state.codes.map((discount, index) => (
            <div key={index} className="font-mono text-xs text-slate-700">
              {discount.applicationType === "automatic"
                ? "Automatic discount"
                : discount.code || "Discount code"}
            </div>
          ))}
          <div className="text-xs text-slate-500">
            Order discount: {state.total != null ? formatMoney(state.total) : "amount unavailable"}
          </div>
        </div>
      );
    case "no-discount":
      return <span className="text-xs text-slate-400">No discount</span>;
    case "code-unavailable":
      return (
        <div className="text-xs text-slate-700">
          Order discount: {formatMoney(state.total)}
          <div className="text-slate-400">Code unavailable</div>
        </div>
      );
    case "unavailable":
      return <span className="text-xs text-slate-400">Discount data unavailable</span>;
  }
}

export default function SalesLineItemsTable({
  lineItems,
  showDiscounts = false,
}: {
  lineItems: SalesLineItemRow[];
  showDiscounts?: boolean;
}) {
  if (lineItems.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No sales recorded for this date range.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Order #</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Line Item / Product</th>
            <th className="px-4 py-3">Quantity</th>
            <th className="px-4 py-3">Item Code</th>
            <th className="px-4 py-3">Item Price</th>
            <th className="px-4 py-3">Total Sale Price</th>
            {showDiscounts && <th className="px-4 py-3">Discount</th>}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-200">
          {lineItems.map((row) => (
            <tr key={row.lineItemId} className="transition hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-700">{row.orderNumber || "-"}</td>
              <td className="px-4 py-3 text-slate-700">{formatDate(row.orderDate)}</td>
              <td className="px-4 py-3 text-slate-900">{row.title || "-"}</td>
              <td className="px-4 py-3 text-slate-700">{row.quantity}</td>
              <td className="px-4 py-3 font-mono text-slate-700">{row.itemNumber || "-"}</td>
              <td className="px-4 py-3 text-slate-700">
                {row.price != null ? formatMoney(row.price) : "-"}
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {formatMoney(row.totalSalePrice)}
              </td>
              {showDiscounts && <td className="px-4 py-3">{renderDiscountCell(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
