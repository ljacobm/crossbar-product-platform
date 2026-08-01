import Sidebar from "@/components/Sidebar";
import PageHeader from "@/components/PageHeader";
import SearchBar from "@/components/SearchBar";
import CollectionsList, { type CollectionListRow } from "@/components/CollectionsList";
import { supabase } from "@/lib/supabase";

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q || "";

  let query = supabase
    .from("collections")
    .select(
      `
      id,
      name,
      sport,
      season,
      active,
      products:collection_products(count)
      `,
      { count: "exact" }
    )
    .order("name", { ascending: true });

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `name.ilike.%${escaped}%,sport.ilike.%${escaped}%,season.ilike.%${escaped}%,audience.ilike.%${escaped}%`
    );
  }

  const { data, count } = await query;

  type RawRow = {
    id: number;
    name: string;
    sport: string | null;
    season: string | null;
    active: boolean;
    products: { count: number }[] | null;
  };

  const collections: CollectionListRow[] = ((data as unknown as RawRow[]) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    season: row.season,
    active: row.active,
    productCount: row.products?.[0]?.count ?? 0,
  }));

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <PageHeader
            title="Collections"
            subtitle="Reusable groups of approved Crossbar products."
          />

          <div className="p-8">
            <div className="rounded-xl bg-white p-6 shadow">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">Collections</h3>
                  <p className="text-sm text-gray-500">
                    Search and manage product collections.
                  </p>
                </div>

                <a
                  href="/collections/new"
                  className="rounded-lg bg-[#860132] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  New Collection
                </a>
              </div>

              <SearchBar
                placeholder="Search by name, sport, season, or audience..."
                basePath="/collections"
              />

              <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Showing {collections.length} of {count ?? 0} collections
                </span>
                <span>Sorted by name</span>
              </div>

              <CollectionsList collections={collections} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
