import { getCatalogSummaryStats } from "@/lib/catalogSummaryData";
import StatCard from "./StatCard";

export default async function SummaryCards() {
  const stats = await getCatalogSummaryStats();

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Products"
        value={stats.products}
        subtitle="Catalog Products"
      />

      <StatCard
        title="Variants"
        value={stats.variants}
        subtitle="Supplier Variants"
      />

      <StatCard
        title="Images"
        value={stats.images}
        subtitle="Product Images"
      />

      <StatCard
        title="Suppliers"
        value={stats.suppliers}
        subtitle="Connected Suppliers"
      />
    </div>
  );
}