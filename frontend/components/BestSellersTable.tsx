import type { BestSellerRow } from "@/lib/onlineStoreSalesTypes";

export default function BestSellersTable({ bestSellers }: { bestSellers: BestSellerRow[] }) {
  if (bestSellers.length === 0) {
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
            <th className="px-4 py-3">Rank</th>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">Items Sold</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-200">
          {bestSellers.map((row, index) => (
            <tr key={row.shopifyProductId} className="transition hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-500">#{index + 1}</td>
              <td className="px-4 py-3 text-slate-900">{row.title}</td>
              <td className="px-4 py-3 text-slate-700">{row.itemsSold.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
