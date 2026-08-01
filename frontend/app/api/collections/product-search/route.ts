import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const collectionId = request.nextUrl.searchParams.get("collectionId");

  let excludeIds: number[] = [];

  if (collectionId) {
    const { data: links } = await supabase
      .from("collection_products")
      .select("catalog_product_id")
      .eq("collection_id", collectionId);

    excludeIds = (links || []).map((link) => link.catalog_product_id);
  }

  let query = supabase
    .from("catalog_products")
    .select(
      `
      id,
      display_name,
      crossbar_sku,
      brand_display,
      crossbar_category,
      active,
      catalog_settings!inner (
        workflow_status
      ),
      product_images (
        id,
        image_url,
        sort_order
      )
      `
    )
    .eq("active", true)
    .in("catalog_settings.workflow_status", ["Approved", "Website Ready"])
    .order("display_name", { ascending: true })
    .order("sort_order", { foreignTable: "product_images", ascending: true })
    .limit(20);

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `display_name.ilike.%${escaped}%,crossbar_sku.ilike.%${escaped}%,brand_display.ilike.%${escaped}%`
    );
  }

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to search products." }, { status: 500 });
  }

  type Row = {
    id: number;
    display_name: string;
    crossbar_sku: string;
    brand_display: string | null;
    crossbar_category: string | null;
    active: boolean;
    catalog_settings: { workflow_status: string } | { workflow_status: string }[] | null;
    product_images: { id: number; image_url: string; sort_order: number | null }[];
  };

  const results = ((data as unknown as Row[]) || []).map((product) => {
    const settings = Array.isArray(product.catalog_settings)
      ? product.catalog_settings[0]
      : product.catalog_settings;

    return {
      id: product.id,
      display_name: product.display_name,
      crossbar_sku: product.crossbar_sku,
      brand_display: product.brand_display,
      crossbar_category: product.crossbar_category,
      workflow_status: settings?.workflow_status || "Imported",
      thumbnail_url: product.product_images?.[0]?.image_url || null,
    };
  });

  return NextResponse.json({ results });
}
