import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";

  let query = supabase
    .from("catalog_products")
    .select(
      `
      id,
      display_name,
      crossbar_sku,
      brand_display,
      crossbar_category,
      source_type,
      active,
      product_images (
        id,
        image_url,
        sort_order
      )
      `
    )
    .eq("active", true)
    .neq("source_type", "bundle")
    .order("display_name", { ascending: true })
    .order("sort_order", { foreignTable: "product_images", ascending: true })
    .limit(20);

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `display_name.ilike.%${escaped}%,crossbar_sku.ilike.%${escaped}%,brand_display.ilike.%${escaped}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to search products." },
      { status: 500 }
    );
  }

  const results = (data || []).map((product) => ({
    id: product.id,
    display_name: product.display_name,
    crossbar_sku: product.crossbar_sku,
    brand_display: product.brand_display,
    crossbar_category: product.crossbar_category,
    source_type: product.source_type,
    active: product.active,
    thumbnail_url: product.product_images?.[0]?.image_url || null,
  }));

  return NextResponse.json({ results });
}
