import { formatMoney } from "@/lib/formatMoney";
import type { SalesLineItemRow } from "@/lib/onlineStoreSalesTypes";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SalesLineItemsTable({ lineItems }: { lineItems: SalesLineItemRow[] }) {
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
