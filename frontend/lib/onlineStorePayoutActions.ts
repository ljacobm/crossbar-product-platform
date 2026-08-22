"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type PayoutFormState = { error: string | null };

function field(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

// Inserts one payout row for the given store. This is the only mutation in
// the sales-dashboard feature, and it can only ever insert into
// online_store_payouts -- it has no path that touches shopify_orders,
// shopify_order_line_items, or shopify_customers, and there is no generic
// "edit any table" UI anywhere in this app for it to piggyback on.
export async function createPayout(
  storeId: number,
  _prevState: PayoutFormState,
  formData: FormData
): Promise<PayoutFormState> {
  const payoutDate = field(formData, "payout_date");
  const amountRaw = field(formData, "amount");
  const paymentType = field(formData, "payment_type");
  const reference = field(formData, "reference");
  const notes = field(formData, "notes");

  if (!payoutDate) {
    return { error: "Payout date is required." };
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a positive number." };
  }

  const { error } = await supabaseAdmin.from("online_store_payouts").insert({
    online_store_id: storeId,
    payout_date: payoutDate,
    amount,
    payment_type: paymentType || null,
    reference: reference || null,
    notes: notes || null,
  });

  if (error) {
    return { error: error.message || "Failed to record payout. Please try again." };
  }

  revalidatePath(`/stores/${storeId}/sales`);
  return { error: null };
}
