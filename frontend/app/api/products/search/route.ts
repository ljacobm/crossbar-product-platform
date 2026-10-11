import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth";
import { searchCatalogProducts } from "@/lib/catalogSummaryData";

export async function GET(request: NextRequest) {
  try {
    await requireStaffSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";

  let data;
  try {
    data = await searchCatalogProducts(q);
  } catch {
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
