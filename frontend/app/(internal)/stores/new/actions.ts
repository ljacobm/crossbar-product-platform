"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffSession } from "@/lib/auth";
import {
  slugify,
  validateStoreFields,
  SLUG_COLLISION_ERROR,
  VENDOR_TAG_COLLISION_ERROR,
  VENDOR_TAG_GENERIC_ERROR,
} from "@/lib/onlineStoreProvisioningLogic";

export type OnlineStoreFormState = {
  error: string | null;
};

function field(formData: FormData, key: string): string {
  return String(formData.get(key) || "");
}

// Creator 3.0, Phase 1 (Store Provisioning). Creates exactly one
// online_stores row and nothing else -- per
// docs/creator3-phase1-store-provisioning.md §2, this must never also
// create a catalog access token, decoration asset, form, or catalog
// baseline row. active and created_at/updated_at rely entirely on the
// column's own existing defaults (active defaults to true -- see §1 of
// the design doc: a new store is immediately active and staff-accessible,
// a concept kept deliberately separate from any future customer-facing
// launch-readiness workflow).
export async function createOnlineStore(
  _prevState: OnlineStoreFormState,
  formData: FormData
): Promise<OnlineStoreFormState> {
  await requireStaffSession();

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
  const slug = slugify(fields.name);

  const { data: newStore, error } = await supabaseAdmin
    .from("online_stores")
    .insert({
      name: fields.name,
      slug,
      vendor_team_tag: fields.vendorTeamTag,
      fundraiser_rate: fields.fundraiserRate,
      organization_type: fields.organizationType,
      sport: fields.sport,
      contact_name: fields.contactName,
      contact_email: fields.contactEmail,
      contact_phone: fields.contactPhone,
      notes: fields.notes,
    })
    .select("id")
    .single();

  if (error || !newStore) {
    if (error?.code === "23505") {
      if (error.message.includes("vendor_team_tag")) {
        return { error: VENDOR_TAG_COLLISION_ERROR };
      }
      if (error.message.includes("slug")) {
        return { error: SLUG_COLLISION_ERROR };
      }
      return { error: "A store with this information already exists." };
    }

    // Forward-compatibility: database/migrations/
    // 20261105_add_online_store_vendor_tag_aliases.sql's cross-table
    // conflict trigger (not yet applied to either database) raises a
    // plain exception, not a 23505, if the tag is already claimed as
    // another store's alias. Catch any other error mentioning the
    // vendor tag column with the same generic, staff-facing message
    // rather than a raw Postgres error string.
    if (error?.message?.includes("vendor_team_tag") || error?.message?.includes("vendor tag")) {
      return { error: VENDOR_TAG_GENERIC_ERROR };
    }

    return {
      error: error?.message || "Failed to create store. Please try again.",
    };
  }

  revalidatePath("/stores");
  redirect(`/stores/${newStore.id}/overview`);
}
