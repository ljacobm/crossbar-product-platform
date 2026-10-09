import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth";
import {
  getLinkedResourceIdsForProduct,
  searchKnowledgeResources,
} from "@/lib/knowledgeResourceData";

export async function GET(request: NextRequest) {
  try {
    await requireStaffSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const type = request.nextUrl.searchParams.get("type")?.trim() || "";
  const productId = request.nextUrl.searchParams.get("productId");

  let excludeIds: number[] = [];

  if (productId) {
    excludeIds = await getLinkedResourceIdsForProduct(productId);
  }

  let data;
  try {
    data = await searchKnowledgeResources({ q, type, excludeIds });
  } catch {
    return NextResponse.json({ error: "Failed to search resources." }, { status: 500 });
  }

  return NextResponse.json({ results: data });
}
