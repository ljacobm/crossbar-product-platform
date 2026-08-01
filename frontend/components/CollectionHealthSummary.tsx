import StatCard from "@/components/StatCard";
import type { CollectionProduct } from "@/components/CollectionProductsList";

function isProblem(product: CollectionProduct): boolean {
  return (
    !product.active ||
    product.workflowStatus === "Archived" ||
    product.supplierStatus === "Discontinued"
  );
}

export default function CollectionHealthSummary({
  products,
}: {
  products: CollectionProduct[];
}) {
  const total = products.length;
  const websiteReady = products.filter((p) => p.websiteReady).length;
  const teamStoreReady = products.filter((p) => p.teamStoreEnabled).length;
  const missingHero = products.filter((p) => !p.thumbnailUrl).length;
  const problems = products.filter(isProblem).length;

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatCard title="Total Products" value={total} />
      <StatCard title="Website Ready" value={websiteReady} />
      <StatCard title="Team Store Ready" value={teamStoreReady} />
      <StatCard title="Missing Hero Image" value={missingHero} />
      <StatCard title="Archived / Inactive" value={problems} />
    </div>
  );
}
