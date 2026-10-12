"use server";

import { requireStaffSession } from "@/lib/auth";
import { buildStoreSalesData, buildStorePayouts } from "@/lib/salesCalculations";
import type { DateRange, Payout, StoreSalesData } from "@/lib/onlineStoreSalesTypes";

// Server-only read path for a single store's Shopify sales data --
// staff-facing. The actual query/calculation logic now lives in
// lib/salesCalculations.ts (Phase 4D, Slice 3), shared with the new
// customer-portal path (lib/customerPortalSalesData.ts); this file's own
// job is exactly what it was before that split: require a staff session,
// then return the shared calculation's result. No behavior change for
// any existing caller of getStoreSalesData/getStorePayouts -- same
// signatures, same return shapes, same requireStaffSession() gate.

export async function getStoreSalesData(
  storeId: number,
  fundraiserRate: number,
  range: DateRange
): Promise<StoreSalesData> {
  await requireStaffSession();
  return buildStoreSalesData(storeId, fundraiserRate, range);
}

export async function getStorePayouts(storeId: number): Promise<Payout[]> {
  await requireStaffSession();
  return buildStorePayouts(storeId);
}
