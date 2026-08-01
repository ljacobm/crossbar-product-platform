import Link from "next/link";

export type CollectionListRow = {
  id: number;
  name: string;
  sport: string | null;
  season: string | null;
  active: boolean;
  productCount: number;
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function CollectionsList({
  collections,
}: {
  collections: CollectionListRow[];
}) {
  if (collections.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No collections match the current search.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Collection Name</th>
            <th className="px-4 py-3">Product Count</th>
            <th className="px-4 py-3">Sport</th>
            <th className="px-4 py-3">Season</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-200">
          {collections.map((collection) => (
            <tr key={collection.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-4">
                <Link
                  href={`/collections/${collection.id}`}
                  className="font-semibold text-slate-900 hover:underline"
                >
                  {collection.name}
                </Link>
              </td>
              <td className="px-4 py-4 text-slate-700">{collection.productCount}</td>
              <td className="px-4 py-4 text-slate-700">{collection.sport || "-"}</td>
              <td className="px-4 py-4 text-slate-700">{collection.season || "-"}</td>
              <td className="px-4 py-4">
                <StatusBadge active={collection.active} />
              </td>
              <td className="px-4 py-4 text-right">
                <Link
                  href={`/collections/${collection.id}`}
                  className="text-lg text-slate-400 hover:text-slate-600"
                >
                  ›
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
