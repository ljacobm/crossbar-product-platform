import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const type = request.nextUrl.searchParams.get("type")?.trim() || "";
  const productId = request.nextUrl.searchParams.get("productId");

  let excludeIds: number[] = [];

  if (productId) {
    const { data: links } = await supabase
      .from("product_resource_links")
      .select("resource_id")
      .eq("catalog_product_id", productId);

    excludeIds = (links || []).map((link) => link.resource_id);
  }

  let query = supabase
    .from("knowledge_resources")
    .select(
      "id, resource_type, title, summary, version, status, file_url, external_url, active"
    )
    .eq("active", true)
    .order("title", { ascending: true })
    .limit(50);

  if (type) {
    query = query.eq("resource_type", type);
  }

  if (q) {
    const escaped = q.replace(/[%_,]/g, (match) => `\\${match}`);
    query = query.or(
      `title.ilike.%${escaped}%,summary.ilike.%${escaped}%,resource_type.ilike.%${escaped}%`
    );
  }

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to search resources." }, { status: 500 });
  }

  return NextResponse.json({ results: data || [] });
}
