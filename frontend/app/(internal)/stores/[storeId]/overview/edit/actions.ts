"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import {
  validateStoreFields,
  VENDOR_TAG_COLLISION_ERROR,
  VENDOR_TAG_GENERIC_ERROR,
} from "@/lib/onlineStoreProvisioningLogic";

export type OnlineStoreFormState = {
  error: string | null;
};

function field(formData: FormData, key: string): string {
  return String(formData.get(key) || "");
}

// Creator 3.0, Phase 1 (Store Provisioning). Reuses validateStoreFields()
// -- the exact same validation function createOnlineStore calls -- so the
// create and edit paths can never silently accept different input. Per
// docs/creator3-phase1-store-provisioning.md §3.2:
//   - `active` is never touched here (no archive/deactivate flow in
//     Phase 1).
//   - `slug` is never touched here, even when `name` changes -- it stays
//     stable once created.
//   - No catalog access token, decoration asset, form, or catalog
//     baseline row is ever created or touched by this action.
export async function updateOnlineStore(
  storeId: number,
  _prevState: OnlineStoreFormState,
  formData: FormData
): Promise<OnlineStoreFormState> {
  await requireStaffSession();

  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    return { error: "Invalid store." };
  }

  const result = validateStoreFields({
    name: field(formData, "name"),
    vendorTeamTag: field(formData, "vendor_team_tag"),
    fundraiserRatePercent: field(formData, "fundraiser_rate_percent"),
    organizationType: field(formData, "organization_type"),
    sport: field(formData, "sport"),
    contactName: field(formData, "contact_name"),
    contactEmail: field(formData, "contact_email"),
    contactPhone: field(formData, "contact_phone"),
    notes: field(formData, "notes"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const { fields } = result;

  const { data: updated, error } = await supabaseAdmin
    .from("online_stores")
    .update({
      name: fields.name,
      vendor_team_tag: fields.vendorTeamTag,
      fundraiser_rate: fields.fundraiserRate,
      organization_type: fields.organizationType,
      sport: fields.sport,
      contact_name: fields.contactName,
      contact_email: fields.contactEmail,
      contact_phone: fields.contactPhone,
      notes: fields.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storeId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505" && error.message.includes("vendor_team_tag")) {
      return { error: VENDOR_TAG_COLLISION_ERROR };
    }

    // Forward-compatibility fallback -- see createOnlineStore's identical
    // comment in app/(internal)/stores/new/actions.ts.
    if (error.message?.includes("vendor_team_tag") || error.message?.includes("vendor tag")) {
      return { error: VENDOR_TAG_GENERIC_ERROR };
    }

    return {
      error: error.message || "Failed to update store. Please try again.",
    };
  }

  // An update matching zero rows is not a Postgres error (PostgREST
  // returns success with no row) -- without this check, editing a
  // since-deleted or otherwise nonexistent store would silently "succeed"
  // and redirect to a store that no longer exists.
  if (!updated) {
    return { error: "This store no longer exists." };
  }

  revalidatePath("/stores");
  revalidatePath(`/stores/${storeId}/overview`);
  redirect(`/stores/${storeId}/overview`);
}
