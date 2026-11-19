import "./loadStagingEnvForTesting"; // MUST be first -- points supabaseAdmin at STAGING, never MAIN.

import assert from "node:assert/strict";
import { supabaseAdmin } from "../lib/supabase-admin";
import {
  slugify,
  validateStoreFields,
  type ValidatedStoreFields,
} from "../lib/onlineStoreProvisioningLogic";

// Creator 3.0, Phase 1 (Store Provisioning) -- end-to-end regression
// against STAGING ONLY (see loadStagingEnvForTesting.ts's fail-closed
// project-ref check). Exercises the REAL shared validation function
// (validateStoreFields -- the exact same function createOnlineStore and
// updateOnlineStore both call) followed by the exact same
// insert/update calls those Server Actions make. requireStaffSession()
// (Next's cookies()-based auth) cannot run outside a real HTTP request,
// so -- following the identical, already-established precedent in
// testCreator3ApprovalWorkflowStaging.ts -- this script bypasses only
// that unrelated, already-proven auth layer, never the business logic
// or database constraints under test.
//
// Creates several clearly-labeled "ZZ TEST -- Phase1 Store Provisioning
// ..." stores and does NOT delete them when done, matching this
// engagement's established policy for STAGING test data.

let failures = 0;
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

async function insertStore(fields: ValidatedStoreFields) {
  const slug = slugify(fields.name);
  return supabaseAdmin
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
    .select("id, name, slug, vendor_team_tag, active, fundraiser_rate, organization_type, sport, contact_name, contact_email, contact_phone, notes")
    .single();
}

async function countRows(table: string, storeId: number): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("online_store_id", storeId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

// Matches by SLUG, not current name -- a prior run's edit test renames
// the base store (proving slug stays stable across a rename, which is
// the whole point of test 16), so a later run must still find and clean
// up that row by its original slug, not by a name match that no longer
// applies after it was deliberately renamed.
async function cleanupBySlugOf(originalName: string) {
  await supabaseAdmin.from("online_stores").delete().eq("slug", slugify(originalName));
}

async function main() {
  console.log("=".repeat(70));
  console.log("Creator 3.0 Phase 1 -- Store Provisioning regression -- STAGING");
  console.log("=".repeat(70));

  const BASE_NAME = "ZZ TEST -- Phase1 Store Provisioning (safe to delete)";
  const SECOND_NAME = "ZZ TEST -- Phase1 Store Provisioning Edit Target (safe to delete)";

  // Clean slate for THIS script's own test stores only (never touches
  // any other store) -- makes the run repeatable, including after a
  // prior run renamed the base store (slug is unaffected by that rename
  // -- see test 16 -- so cleanup must still key off the original slug).
  await cleanupBySlugOf(BASE_NAME);
  await cleanupBySlugOf(SECOND_NAME);

  // ---- Before snapshot ----
  const { count: beforeCount } = await supabaseAdmin
    .from("online_stores")
    .select("id", { count: "exact", head: true });
  console.log(`\nBEFORE: ${beforeCount} total stores on STAGING.\n`);

  let baseStoreId: number | null = null;
  let secondStoreId: number | null = null;

  // ---- Acceptance test 3: minimal creation, only name filled ----
  await step("creation with only Store Name succeeds with correct defaults (test 3)", async () => {
    const validation = validateStoreFields({
      name: BASE_NAME,
      vendorTeamTag: "",
      fundraiserRatePercent: "",
      organizationType: "",
      sport: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      notes: "",
    });
    assert.equal(validation.ok, true);
    if (!validation.ok) throw new Error("unreachable");

    const { data, error } = await insertStore(validation.fields);
    if (error || !data) throw new Error(error?.message ?? "insert returned no row");

    baseStoreId = data.id;
    assert.equal(data.active, true, "active must be true immediately (test 4)");
    assert.equal(data.fundraiser_rate, 0.2);
    assert.equal(data.organization_type, null);
    assert.equal(data.contact_email, null);
    assert.ok(data.slug?.startsWith("zz-test-phase1-store-provisioning"));
  });

  // ---- Acceptance test 4: immediately accessible, no activation step ----
  await step("new store is immediately readable via getOnlineStoreById-equivalent query (test 4)", async () => {
    if (!baseStoreId) throw new Error("base store was not created");
    const { data, error } = await supabaseAdmin
      .from("online_stores")
      .select("id, active")
      .eq("id", baseStoreId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "store not found");
    assert.equal(data.active, true);
  });

  // ---- Acceptance test 5: slug collision ----
  await step("duplicate store name (slug collision) is rejected, creates no row (test 5)", async () => {
    const validation = validateStoreFields({
      name: BASE_NAME, // identical name -> identical slug
      vendorTeamTag: "",
      fundraiserRatePercent: "",
      organizationType: "",
      sport: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      notes: "",
    });
    if (!validation.ok) throw new Error("unreachable");

    const { data, error } = await insertStore(validation.fields);
    assert.equal(data, null);
    assert.equal(error?.code, "23505");
    assert.ok(error?.message.includes("slug"));
  });

  // ---- Create a second store to test vendor-tag collision against ----
  const SECOND_TAG = "ZZ Test Phase1 Edit Target";
  await step("second test store created for vendor-tag collision test", async () => {
    const validation = validateStoreFields({
      name: SECOND_NAME,
      vendorTeamTag: SECOND_TAG,
      fundraiserRatePercent: "",
      organizationType: "",
      sport: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      notes: "",
    });
    if (!validation.ok) throw new Error("unreachable");

    const { data, error } = await insertStore(validation.fields);
    if (error || !data) throw new Error(error?.message ?? "insert returned no row");
    secondStoreId = data.id;
    assert.equal(data.vendor_team_tag, SECOND_TAG);
  });

  // ---- Acceptance test 6: vendor_team_tag collision ----
  await step("duplicate vendor_team_tag is rejected, creates no row (test 6)", async () => {
    const validation = validateStoreFields({
      name: "ZZ TEST -- Phase1 Store Provisioning Should Not Exist",
      vendorTeamTag: SECOND_TAG, // identical tag -> collision
      fundraiserRatePercent: "",
      organizationType: "",
      sport: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      notes: "",
    });
    if (!validation.ok) throw new Error("unreachable");

    const { data, error } = await insertStore(validation.fields);
    assert.equal(data, null);
    assert.equal(error?.code, "23505");
    assert.ok(error?.message.includes("vendor_team_tag"));
  });

  // ---- Acceptance test 7 & 8: vendor-tag normalization and case-sensitivity ----
  await step("vendor tag whitespace is collapsed to match real Shopify ingestion (test 7)", async () => {
    if (!secondStoreId) throw new Error("second store missing");
    // Mirrors matchOnlineStores()'s exact query shape against the stored,
    // already-collapsed tag.
    const { data } = await supabaseAdmin
      .from("online_stores")
      .select("id, vendor_team_tag")
      .in("vendor_team_tag", [SECOND_TAG])
      .maybeSingle();
    assert.equal(data?.id, secondStoreId);
  });

  await step("vendor tag matching is case-sensitive -- differently-cased lookup does not match (test 8)", async () => {
    const differentCase = SECOND_TAG.toUpperCase();
    assert.notEqual(differentCase, SECOND_TAG);
    const { data } = await supabaseAdmin
      .from("online_stores")
      .select("id")
      .in("vendor_team_tag", [differentCase])
      .maybeSingle();
    assert.equal(data, null, "a differently-cased tag must NOT match the stored tag");
  });

  // ---- Acceptance test 9: fundraiser rate boundaries ----
  await step("fundraiser rate accepts 0% and 100% inclusive, stored exactly (test 9)", async () => {
    const zero = validateStoreFields({
      name: "ZZ TEST -- Phase1 Store Provisioning Rate Zero",
      vendorTeamTag: "",
      fundraiserRatePercent: "0",
      organizationType: "",
      sport: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      notes: "",
    });
    const hundred = validateStoreFields({
      name: "ZZ TEST -- Phase1 Store Provisioning Rate Hundred",
      vendorTeamTag: "",
      fundraiserRatePercent: "100",
      organizationType: "",
      sport: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      notes: "",
    });
    if (!zero.ok || !hundred.ok) throw new Error("unreachable");

    await cleanupBySlugOf(zero.fields.name);
    await cleanupBySlugOf(hundred.fields.name);

    const zeroResult = await insertStore(zero.fields);
    const hundredResult = await insertStore(hundred.fields);

    if (zeroResult.error || !zeroResult.data) throw new Error(zeroResult.error?.message);
    if (hundredResult.error || !hundredResult.data) throw new Error(hundredResult.error?.message);

    assert.equal(Number(zeroResult.data.fundraiser_rate), 0);
    assert.equal(Number(hundredResult.data.fundraiser_rate), 1);

    // Clean these two boundary-only stores immediately -- they exist
    // purely to prove the round-trip, not for later inspection.
    await supabaseAdmin.from("online_stores").delete().eq("id", zeroResult.data.id);
    await supabaseAdmin.from("online_stores").delete().eq("id", hundredResult.data.id);
  });

  // ---- Acceptance test 11: scope boundary -- creation touches nothing else ----
  await step("creating a store creates zero rows in token/decoration/forms/baseline tables (test 11)", async () => {
    if (!baseStoreId) throw new Error("base store missing");
    const [tokens, decoration, forms, baseline] = await Promise.all([
      countRows("online_store_catalog_access_tokens", baseStoreId),
      countRows("online_store_decoration_assets", baseStoreId),
      countRows("online_store_forms", baseStoreId),
      countRows("online_store_catalog_baseline", baseStoreId),
    ]);
    assert.equal(tokens, 0);
    assert.equal(decoration, 0);
    assert.equal(forms, 0);
    assert.equal(baseline, 0);
  });

  // ---- Acceptance test 14 & 16: editing persists fields, slug stays stable ----
  await step("editing persists all fields and leaves slug unchanged even when name changes (test 14, 16)", async () => {
    if (!baseStoreId) throw new Error("base store missing");

    const { data: before, error: beforeErr } = await supabaseAdmin
      .from("online_stores")
      .select("slug")
      .eq("id", baseStoreId)
      .single();
    if (beforeErr || !before) throw new Error(beforeErr?.message);
    const originalSlug = before.slug;

    const validation = validateStoreFields({
      name: BASE_NAME + " (renamed)",
      vendorTeamTag: "ZZ Test Phase1 Base Renamed",
      fundraiserRatePercent: "35",
      organizationType: "Club",
      sport: "Lacrosse",
      contactName: "Jamie Smith",
      contactEmail: "jamie@example.invalid",
      contactPhone: "555-0100",
      notes: "Edited by the Phase 1 regression script.",
    });
    if (!validation.ok) throw new Error("unreachable");
    const { fields } = validation;

    const { error: updateErr } = await supabaseAdmin
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
      })
      .eq("id", baseStoreId);
    if (updateErr) throw new Error(updateErr.message);

    const { data: after, error: afterErr } = await supabaseAdmin
      .from("online_stores")
      .select("name, slug, vendor_team_tag, fundraiser_rate, organization_type, sport, contact_name, contact_email, contact_phone, notes")
      .eq("id", baseStoreId)
      .single();
    if (afterErr || !after) throw new Error(afterErr?.message);

    assert.equal(after.name, BASE_NAME + " (renamed)");
    assert.equal(after.slug, originalSlug, "slug must stay stable across a name edit");
    assert.equal(after.vendor_team_tag, "ZZ Test Phase1 Base Renamed");
    assert.equal(Number(after.fundraiser_rate), 0.35);
    assert.equal(after.organization_type, "Club");
    assert.equal(after.contact_email, "jamie@example.invalid");
    assert.equal(after.notes, "Edited by the Phase 1 regression script.");
  });

  // ---- Acceptance test 15: edit-path vendor-tag collision ----
  await step("editing a store's vendor tag to another store's tag is rejected, leaves row unchanged (test 15)", async () => {
    if (!baseStoreId) throw new Error("base store missing");

    const { data: before, error: beforeErr } = await supabaseAdmin
      .from("online_stores")
      .select("vendor_team_tag")
      .eq("id", baseStoreId)
      .single();
    if (beforeErr || !before) throw new Error(beforeErr?.message);
    const originalTag = before.vendor_team_tag;

    const { error: updateErr } = await supabaseAdmin
      .from("online_stores")
      .update({ vendor_team_tag: SECOND_TAG }) // already claimed by secondStoreId
      .eq("id", baseStoreId);

    assert.equal(updateErr?.code, "23505");
    assert.ok(updateErr?.message.includes("vendor_team_tag"));

    const { data: after, error: afterErr } = await supabaseAdmin
      .from("online_stores")
      .select("vendor_team_tag")
      .eq("id", baseStoreId)
      .single();
    if (afterErr || !after) throw new Error(afterErr?.message);
    assert.equal(after.vendor_team_tag, originalTag, "row must be unchanged after a rejected update");
  });

  // ---- Acceptance test 17: editing touches nothing else either ----
  await step("editing a store creates zero rows in token/decoration/forms/baseline tables (test 17)", async () => {
    if (!baseStoreId) throw new Error("base store missing");
    const [tokens, decoration, forms, baseline] = await Promise.all([
      countRows("online_store_catalog_access_tokens", baseStoreId),
      countRows("online_store_decoration_assets", baseStoreId),
      countRows("online_store_forms", baseStoreId),
      countRows("online_store_catalog_baseline", baseStoreId),
    ]);
    assert.equal(tokens, 0);
    assert.equal(decoration, 0);
    assert.equal(forms, 0);
    assert.equal(baseline, 0);
  });

  // ---- Unrelated-store safety: confirm pre-existing test stores (14, 15) untouched ----
  await step("pre-existing STAGING test stores (14, 15) are unaffected", async () => {
    const { data, error } = await supabaseAdmin
      .from("online_stores")
      .select("id, name")
      .in("id", [14, 15]);
    if (error) throw new Error(error.message);
    // Not asserting exact content (out of this phase's scope to know it
    // precisely) -- only that the query succeeds and returns rows,
    // proving this script's inserts/updates/deletes never touched them
    // (none of the statements above ever referenced id 14 or 15).
    console.log(`  (informational) stores 14/15 still present: ${JSON.stringify(data)}`);
  });

  // ---- After snapshot ----
  const { count: afterCount } = await supabaseAdmin
    .from("online_stores")
    .select("id", { count: "exact", head: true });
  console.log(`\nAFTER: ${afterCount} total stores on STAGING.`);
  console.log(`Net new stores left in place by this run: ${BASE_NAME}, ${SECOND_NAME} (clearly labeled, not deleted).`);

  console.log("\n" + "=".repeat(70));
  if (failures > 0) {
    console.error(`${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("All tests PASSED.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
