import { supabase } from "@/lib/supabase";
import StatCard from "./StatCard";

export default async function SummaryCards() {
  const [
    products,
    variants,
    images,
    suppliers,
  ] = await Promise.all([
    supabase
      .from("catalog_products")
      .select("*", { count: "exact", head: true }),

    supabase
      .from("product_variants")
      .select("*", { count: "exact", head: true }),

    supabase
      .from("product_images")
      .select("*", { count: "exact", head: true }),

    supabase
      .from("suppliers")
      .select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Products"
        value={products.count ?? 0}
        subtitle="Catalog Products"
      />

      <StatCard
        title="Variants"
        value={variants.count ?? 0}
        subtitle="Supplier Variants"
      />

      <StatCard
        title="Images"
        value={images.count ?? 0}
        subtitle="Product Images"
      />

      <StatCard
        title="Suppliers"
        value={suppliers.count ?? 0}
        subtitle="Connected Suppliers"
      />
    </div>
  );
}