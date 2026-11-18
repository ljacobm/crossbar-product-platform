import "./loadStagingEnvForTesting"; // MUST be first -- points supabaseAdmin at STAGING, never MAIN.

import assert from "node:assert/strict";
import { supabaseAdmin } from "../lib/supabase-admin";
import {
  submitCustomerCatalogForReview,
  saveCustomerCatalogDraftSelection,
  getCustomerSubmissionStatus,
} from "../lib/onlineStoreCatalogCustomerData";
import { resolveCatalogAccessStoreId } from "../lib/onlineStoreCatalogAccess";
import { generateRawCatalogAccessToken, hashCatalogAccessToken } from "../lib/onlineStoreCatalogAccessTokenCrypto";

// End-to-end regression test for the Creator 3.0 submission/approval
// workflow fix, run against STAGING ONLY (see loadStagingEnvForTesting.ts
// for the fail-closed project-ref check). Creates its own isolated test
// store + approved style + access token (vendor_team_tag left null, so
// Shopify order ingestion can structurally never match it -- see
// shopifyNormalized.ts's map.set(store.vendor_team_tag, store.id), which
// skips null tags entirely). Exercises the REAL application functions
// for every customer-facing action (submitCustomerCatalogForReview,
// saveCustomerCatalogDraftSelection, getCustomerSubmissionStatus,
// resolveCatalogAccessStoreId); staff decisions call the
// decide_catalog_submission_item RPC directly with the same arguments
// decideCatalogSubmissionItem() in lib/onlineStoreCatalogBuilderData.ts
// passes it, since that TS function is a thin, already-typechecked
// pass-through and the atomicity/locking guarantee under test lives
// entirely in the RPC's own SQL -- requireStaffSession() (Next's
// cookies()-based auth) cannot run outside a real request, so this
// script bypasses only that unrelated, already-validated auth layer,
// never the business logic being tested.
//
// Does not delete its test data when done -- left in place, clearly
// labeled, for any follow-up inspection (same policy as MAIN's test
// store 184).

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

type DecideResult = { outcome: string; item_decision: string; submission_status: string };

async function decide(itemId: number, decision: "approved" | "rejected", notes: string | null, decidedBy: string): Promise<DecideResult> {
  const { data, error } = await supabaseAdmin.rpc("decide_catalog_submission_item", {
    p_item_id: itemId,
    p_decision: decision,
    p_notes: notes,
    p_decided_by: decidedBy,
  });
  if (error) throw new Error(`RPC error: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("RPC returned no row");
  return row as DecideResult;
}

async function getPendingItem(submissionId: number, colorName: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("online_store_catalog_submission_items")
    .select("id")
    .eq("submission_id", submissionId)
    .eq("color_name", colorName)
    .single();
  if (error || !data) throw new Error(`Could not find item for color ${colorName} in submission ${submissionId}: ${error?.message}`);
  return data.id;
}

async function getBaselineColors(storeId: number): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from("online_store_catalog_baseline").select("color_name").eq("online_store_id", storeId);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.color_name));
}

async function main() {
  console.log("=".repeat(70));
  console.log("Creator 3.0 approval-workflow regression -- STAGING");
  console.log("=".repeat(70));

  // ---- Setup: isolated test store + approved style + access token ----
  const { data: existingTest } = await supabaseAdmin
    .from("online_stores")
    .select("id")
    .eq("slug", "zz-test-creator3-approval-workflow-fix")
    .maybeSingle();
  if (existingTest) {
    throw new Error(
      `Test store slug already exists (id ${existingTest.id}) -- a previous run left it behind; ` +
        `inspect/clean it up manually before re-running, this script never deletes.`
    );
  }

  const { data: store, error: storeErr } = await supabaseAdmin
    .from("online_stores")
    .insert({
      name: "ZZ TEST -- Creator 3.0 Approval Workflow Fix (staging, safe to delete)",
      slug: "zz-test-creator3-approval-workflow-fix",
      vendor_team_tag: null,
      active: true,
    })
    .select("id")
    .single();
  if (storeErr || !store) throw new Error(`Failed to create test store: ${storeErr?.message}`);
  const storeId: number = store.id;
  console.log(`Created isolated test store id=${storeId} (vendor_team_tag=null)`);

  const { data: supplier } = await supabaseAdmin.from("suppliers").select("id").limit(1).single();
  const { data: supplierProduct } = await supabaseAdmin.from("supplier_products").select("id").limit(1).single();
  if (!supplier || !supplierProduct) throw new Error("Staging has no suppliers/supplier_products to attach a test style to.");

  const { data: style, error: styleErr } = await supabaseAdmin
    .from("approved_catalog_styles")
    .insert({ supplier_id: supplier.id, supplier_product_id: supplierProduct.id, style_code: "ZZTEST-STYLE", added_by: "staging-regression-script" })
    .select("id")
    .single();
  if (styleErr || !style) throw new Error(`Failed to create test approved style: ${styleErr?.message}`);
  const styleId: number = style.id;
  console.log(`Created approved_catalog_styles id=${styleId} (supplier_product_id=${supplierProduct.id})`);

  const rawToken = generateRawCatalogAccessToken();
  const tokenHash = hashCatalogAccessToken(rawToken);
  const { error: tokenErr } = await supabaseAdmin.rpc("rotate_online_store_catalog_access_token", {
    p_online_store_id: storeId,
    p_token_hash: tokenHash,
    p_expires_at: null,
  });
  if (tokenErr) throw new Error(`Failed to create access token: ${tokenErr.message}`);
  console.log("Created customer access token.");

  // ================= Scenario 1: double-click / identical repeated submission =================
  await step("1a. add Black to draft, submit -> 'submitted'", async () => {
    const ok = await saveCustomerCatalogDraftSelection(rawToken, styleId, "Black", true);
    assert.equal(ok.ok, true);
    const result = await submitCustomerCatalogForReview(rawToken, "Test Customer");
    assert.ok(result);
    assert.equal(result!.outcome, "submitted");
  });

  await step("1b. immediate repeat submit of the SAME unchanged draft -> 'already-pending' (no duplicate row)", async () => {
    const result = await submitCustomerCatalogForReview(rawToken, "Test Customer");
    assert.ok(result);
    assert.equal(result!.outcome, "already-pending");
  });

  await step("1c. exactly one submission row exists for this store so far", async () => {
    const { data, error } = await supabaseAdmin.from("online_store_catalog_submissions").select("id").eq("online_store_id", storeId);
    if (error) throw error;
    assert.equal(data!.length, 1);
  });

  const submission1Id = (
    await supabaseAdmin.from("online_store_catalog_submissions").select("id").eq("online_store_id", storeId).single()
  ).data!.id;

  // Decide submission 1's only item (Black, approved) so the store returns to a non-blocking state.
  await step("1d. decide Black approved -> baseline gets Black, submission terminal", async () => {
    const itemId = await getPendingItem(submission1Id, "Black");
    const result = await decide(itemId, "approved", null, "staff-tester");
    assert.equal(result.outcome, "applied");
    assert.equal(result.submission_status, "approved");
    const baseline = await getBaselineColors(storeId);
    assert.ok(baseline.has("Black"));
  });

  // ================= Scenario 2: TRUE concurrent identical submissions =================
  await step("2. two concurrent identical submit calls for the same NEW diff -> exactly one 'submitted', one 'already-pending'", async () => {
    const ok = await saveCustomerCatalogDraftSelection(rawToken, styleId, "Navy", true);
    assert.equal(ok.ok, true);

    const [r1, r2] = await Promise.all([
      submitCustomerCatalogForReview(rawToken, "Customer A"),
      submitCustomerCatalogForReview(rawToken, "Customer A (second tab)"),
    ]);
    const outcomes = [r1!.outcome, r2!.outcome].sort();
    assert.deepEqual(outcomes, ["already-pending", "submitted"]);

    const { data, error } = await supabaseAdmin
      .from("online_store_catalog_submissions")
      .select("id, status")
      .eq("online_store_id", storeId)
      .order("id", { ascending: true });
    if (error) throw error;
    // submission 1 (Black, already decided) + exactly ONE new submission from the race.
    assert.equal(data!.length, 2, `expected 2 total submissions, got ${data!.length}`);
  });

  const submission2Id = (
    await supabaseAdmin
      .from("online_store_catalog_submissions")
      .select("id")
      .eq("online_store_id", storeId)
      .neq("id", submission1Id)
      .single()
  ).data!.id;

  await step("2b. decide Navy approved", async () => {
    const itemId = await getPendingItem(submission2Id, "Navy");
    const result = await decide(itemId, "approved", null, "staff-tester");
    assert.equal(result.outcome, "applied");
    const baseline = await getBaselineColors(storeId);
    assert.ok(baseline.has("Navy"));
  });

  // ================= Scenario 3: genuine revision allowed once prior submission is fully decided =================
  await step("3. after submission 2 is fully decided, a genuine new diff (remove Navy, add Red) submits cleanly", async () => {
    await saveCustomerCatalogDraftSelection(rawToken, styleId, "Navy", false);
    await saveCustomerCatalogDraftSelection(rawToken, styleId, "Red", true);
    const result = await submitCustomerCatalogForReview(rawToken, "Customer A");
    assert.ok(result);
    assert.equal(result!.outcome, "submitted");
  });

  const submission3Id = (
    await supabaseAdmin
      .from("online_store_catalog_submissions")
      .select("id")
      .eq("online_store_id", storeId)
      .not("id", "in", `(${submission1Id},${submission2Id})`)
      .single()
  ).data!.id;

  await step("3b. reject the Red addition (Navy removal approved) -- add->approve->remove / add->reject sequence set up", async () => {
    const redItemId = await getPendingItem(submission3Id, "Red");
    const navyItemId = await getPendingItem(submission3Id, "Navy");
    const redResult = await decide(redItemId, "rejected", "not this season", "staff-tester");
    const navyResult = await decide(navyItemId, "approved", null, "staff-tester");
    assert.equal(redResult.outcome, "applied");
    assert.equal(navyResult.outcome, "applied");
    // redResult reflects the status WHILE Navy was still pending (correctly 'pending');
    // navyResult is the later, fully-decided call -- its status is the true final aggregate.
    assert.equal(redResult.submission_status, "pending");
    assert.equal(navyResult.submission_status, "partially_approved"); // fully decided, mixed -- terminal, non-blocking
    const baseline = await getBaselineColors(storeId);
    assert.ok(!baseline.has("Navy")); // removal was approved
    assert.ok(!baseline.has("Red")); // addition was rejected, never touched baseline
  });

  await step("3c. 'partially_approved' (fully decided, mixed) does NOT block a new submission", async () => {
    const result = await submitCustomerCatalogForReview(rawToken, "Customer A");
    // draft currently: Black, Red (removed Navy in step 3, Red still selected despite rejection --
    // draft is independent of decisions) vs baseline: Black -- so Red is a genuine re-request diff.
    assert.ok(result);
    assert.equal(result!.outcome, "submitted", `expected 'submitted', a terminal partially_approved status must not block -- got ${result!.outcome}`);
  });

  // ================= Scenario 4: rejection -> revision -> resubmission -> approval, status trail =================
  const submission4Id = (
    await supabaseAdmin
      .from("online_store_catalog_submissions")
      .select("id")
      .eq("online_store_id", storeId)
      .not("id", "in", `(${submission1Id},${submission2Id},${submission3Id})`)
      .single()
  ).data!.id;

  await step("4. approve the re-requested Red -> baseline gets Red; customer status shows 'approved', not the earlier rejection", async () => {
    const redItemId = await getPendingItem(submission4Id, "Red");
    const result = await decide(redItemId, "approved", null, "staff-tester");
    assert.equal(result.outcome, "applied");

    const status = await getCustomerSubmissionStatus(rawToken);
    assert.ok(status);
    const redStatus = status!.find((s) => s.colorName === "Red");
    assert.ok(redStatus, "Red should appear in customer status");
    assert.equal(redStatus!.decision, "approved", "the LATER approval must win over the earlier rejection");
    assert.equal(redStatus!.decisionNotes, null, "the later decision's (null) notes must win, not the earlier rejection's notes");
  });

  await step("4b. add->approve->remove sequence for Navy: status shows the removal, not the stale earlier approval", async () => {
    // Navy was added+approved (scenario 2), then removed+approved (scenario 3b).
    const status = await getCustomerSubmissionStatus(rawToken);
    assert.ok(status);
    const navyStatus = status!.find((s) => s.colorName === "Navy");
    assert.ok(navyStatus, "Navy should appear in customer status");
    assert.equal(navyStatus!.changeType, "removed", "the newer removal must win over the older addition -- this is the dedup-key fix");
    assert.equal(navyStatus!.decision, "approved");
  });

  // ================= Scenario 5: concurrent decisions on DIFFERENT items of the SAME submission =================
  await step("5. set up a 2-item submission (Gold added, Red removed) for the concurrent-decision test", async () => {
    await saveCustomerCatalogDraftSelection(rawToken, styleId, "Gold", true);
    await saveCustomerCatalogDraftSelection(rawToken, styleId, "Red", false);
    const result = await submitCustomerCatalogForReview(rawToken, "Customer A");
    assert.ok(result);
    assert.equal(result!.outcome, "submitted");
  });

  const submission5Id = (
    await supabaseAdmin
      .from("online_store_catalog_submissions")
      .select("id")
      .eq("online_store_id", storeId)
      .not("id", "in", `(${submission1Id},${submission2Id},${submission3Id},${submission4Id})`)
      .single()
  ).data!.id;

  await step("5b. decide both items of submission 5 CONCURRENTLY -> correct final aggregate status, no lost update", async () => {
    const goldItemId = await getPendingItem(submission5Id, "Gold");
    const redItemId = await getPendingItem(submission5Id, "Red");

    const [goldResult, redResult] = await Promise.all([
      decide(goldItemId, "approved", null, "reviewer-1"),
      decide(redItemId, "rejected", "keep red for now", "reviewer-2"),
    ]);

    assert.equal(goldResult.outcome, "applied");
    assert.equal(redResult.outcome, "applied");
    // The lock serializes the two calls rather than running them at the
    // same instant, so whichever call's critical section ran FIRST
    // legitimately reports 'pending' (the other item was still
    // undecided at that moment) -- that is correct, not a bug. The
    // proof there's no lost update is the submission's CURRENT status
    // after BOTH calls have returned: it must reflect BOTH decisions,
    // not just whichever one happened to compute status last from a
    // stale sibling read.
    const statusesSeen = [goldResult.submission_status, redResult.submission_status].sort();
    assert.deepEqual(statusesSeen, ["partially_approved", "pending"]);

    const { data: finalSubmission } = await supabaseAdmin
      .from("online_store_catalog_submissions")
      .select("status")
      .eq("id", submission5Id)
      .single();
    assert.equal(finalSubmission!.status, "partially_approved");

    const { data: items } = await supabaseAdmin
      .from("online_store_catalog_submission_items")
      .select("color_name, decision")
      .eq("submission_id", submission5Id);
    const byColor = Object.fromEntries((items ?? []).map((r) => [r.color_name, r.decision]));
    assert.equal(byColor["Gold"], "approved");
    assert.equal(byColor["Red"], "rejected");

    const baseline = await getBaselineColors(storeId);
    assert.ok(baseline.has("Gold"));
    assert.ok(baseline.has("Red")); // the removal was REJECTED -- rejected items never touch the baseline, so Red stays
  });

  // ================= Scenario 6: concurrent decisions on the SAME item (double-click / two reviewers) =================
  await step("6. set up a 1-item submission (Silver added) for the same-item race test", async () => {
    await saveCustomerCatalogDraftSelection(rawToken, styleId, "Silver", true);
    const result = await submitCustomerCatalogForReview(rawToken, "Customer A");
    assert.ok(result);
    assert.equal(result!.outcome, "submitted");
  });

  const submission6Id = (
    await supabaseAdmin
      .from("online_store_catalog_submissions")
      .select("id")
      .eq("online_store_id", storeId)
      .not("id", "in", `(${submission1Id},${submission2Id},${submission3Id},${submission4Id},${submission5Id})`)
      .single()
  ).data!.id;

  await step("6b. two concurrent decisions on the SAME item -> exactly one 'applied', one 'already-decided', no double-apply", async () => {
    const silverItemId = await getPendingItem(submission6Id, "Silver");

    const [r1, r2] = await Promise.all([
      decide(silverItemId, "approved", null, "reviewer-1 (double-click)"),
      decide(silverItemId, "rejected", "duplicate click", "reviewer-1 (double-click)"),
    ]);

    const outcomes = [r1.outcome, r2.outcome].sort();
    assert.deepEqual(outcomes, ["already-decided", "applied"]);

    // Whichever one applied, the item's final decision must match it
    // exactly -- never corrupted, never double-applied to baseline.
    const { data: item } = await supabaseAdmin
      .from("online_store_catalog_submission_items")
      .select("decision")
      .eq("id", silverItemId)
      .single();
    const applied = r1.outcome === "applied" ? r1 : r2;
    assert.equal(item!.decision, applied.item_decision);

    const baseline = await getBaselineColors(storeId);
    assert.equal(baseline.has("Silver"), applied.item_decision === "approved");
  });

  // ================= Scenario 7: full baseline consistency check =================
  await step("7. final baseline exactly matches the sum of approved decisions across all submissions", async () => {
    const { data: items } = await supabaseAdmin
      .from("online_store_catalog_submission_items")
      .select("color_name, change_type, decision, submission_id")
      .in("submission_id", [submission1Id, submission2Id, submission3Id, submission4Id, submission5Id, submission6Id])
      .order("submission_id", { ascending: true });

    // Replay approved decisions in submission order (submission_id order
    // is also chronological here) to compute the expected baseline.
    const expected = new Set<string>();
    for (const item of items ?? []) {
      if (item.decision !== "approved") continue;
      if (item.change_type === "added") expected.add(item.color_name);
      else expected.delete(item.color_name);
    }

    const actual = await getBaselineColors(storeId);
    assert.deepEqual([...actual].sort(), [...expected].sort());
  });

  // ================= Scenario 8: token access and store isolation =================
  await step("8a. garbage token resolves to null (non-disclosing)", async () => {
    const resolved = await resolveCatalogAccessStoreId("not-a-real-token-at-all");
    assert.equal(resolved, null);
  });

  await step("8b. the real token resolves to this store, and only this store", async () => {
    const resolved = await resolveCatalogAccessStoreId(rawToken);
    assert.ok(resolved);
    assert.equal(resolved!.storeId, storeId);
  });

  let secondStoreId: number;
  let secondRawToken: string;
  await step("8c. isolation: a second store's token resolves only to the second store, never the first", async () => {
    const { data: secondStore, error } = await supabaseAdmin
      .from("online_stores")
      .insert({
        name: "ZZ TEST -- Creator 3.0 Isolation Check B (staging, safe to delete)",
        slug: "zz-test-creator3-isolation-check-b",
        vendor_team_tag: null,
        active: true,
      })
      .select("id")
      .single();
    if (error || !secondStore) throw new Error(`Failed to create second isolation store: ${error?.message}`);
    secondStoreId = secondStore.id;

    secondRawToken = generateRawCatalogAccessToken();
    const secondHash = hashCatalogAccessToken(secondRawToken);
    const { error: tokenErr2 } = await supabaseAdmin.rpc("rotate_online_store_catalog_access_token", {
      p_online_store_id: secondStoreId,
      p_token_hash: secondHash,
      p_expires_at: null,
    });
    if (tokenErr2) throw new Error(tokenErr2.message);

    const resolvedFirst = await resolveCatalogAccessStoreId(rawToken);
    const resolvedSecond = await resolveCatalogAccessStoreId(secondRawToken);
    assert.equal(resolvedFirst!.storeId, storeId);
    assert.equal(resolvedSecond!.storeId, secondStoreId);
    assert.notEqual(resolvedFirst!.storeId, resolvedSecond!.storeId);

    // The first store's status/draft must be completely untouched by
    // creating the second store.
    const firstStatus = await getCustomerSubmissionStatus(rawToken);
    assert.ok(firstStatus && firstStatus.length > 0);
  });

  await step("8d. revoking the first store's token makes it resolve to null (same generic failure as a bad token)", async () => {
    const { error } = await supabaseAdmin
      .from("online_store_catalog_access_tokens")
      .update({ active: false })
      .eq("online_store_id", storeId)
      .eq("active", true);
    if (error) throw error;
    const resolved = await resolveCatalogAccessStoreId(rawToken);
    assert.equal(resolved, null);
  });

  console.log("\n" + "=".repeat(70));
  if (failures === 0) {
    console.log(`ALL SCENARIOS PASSED. Test stores: id=${storeId} (primary), id=${secondStoreId!} (isolation check) -- left in place on staging, both safe to delete.`);
  } else {
    console.log(`${failures} SCENARIO(S) FAILED. See above.`);
    process.exitCode = 1;
  }
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
