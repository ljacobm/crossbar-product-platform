export {}; // Forces module scope -- without this, a script file with no
// import/export statements is treated by TypeScript as a global script,
// and its top-level `main` would collide with the same-named function in
// verifyStoreProvisioningUnauthenticatedAccess.ts (also import-free).

// Creator 3.0, Phase 1 (Store Provisioning) -- strongest-available
// authorization verification: a GENUINELY VALID, well-formed Server
// Action invocation (the real action reference, the real FormData
// encoding, captured from an actual authenticated browser session via a
// fetch() wrapper), replayed against the real deployed Vercel Preview
// with NO cookies -- i.e. not a forged/garbage request, but the exact
// shape a legitimate authenticated submission sends, minus the session.
//
// Companion to verifyStoreProvisioningAuthorization.ts (structural) and
// verifyStoreProvisioningUnauthenticatedAccess.ts (behavioral, local dev
// server / app-level proxy). This script specifically exercises the
// PLATFORM layer (Vercel Deployment Protection), which sits in front of
// the app-level proxy and the action's own requireStaffSession() check.
//
// SAFETY: the payload below deliberately uses a store name that is
// ALREADY a duplicate on STAGING (an existing "ZZ TEST -- Phase1 Store
// Provisioning (safe to delete) (renamed)" row) -- so even in the
// hypothetical worst case that every auth layer were somehow bypassed,
// this specific request could only hit the slug-uniqueness rejection,
// never actually create or modify a row.
//
// WHAT THIS FILE DOES NOT CONTAIN: no cookie, no Supabase/Vercel auth
// token, no session identifier, no staff email or password, no API key,
// no secret of any kind -- the deliberate absence of a Cookie header is
// the entire point of the test. ACTION_ID and the "_1_$ACTION_KEY" value
// below are NOT credentials: they are deterministic, content-derived
// build identifiers that Next.js's React Server Components bundler
// assigns to this exact exported function/closure at build time (a hash
// of the module graph, not a secret tied to any user or session) -- the
// same value appears in plain text in the request headers of every real
// browser submission of this form, visible to anyone with devtools open.
// Knowing this value grants no access by itself, which is exactly what
// this test demonstrates: the request is still rejected with it.
//
// WHAT THIS TEST PROVES, PRECISELY: that Vercel Deployment Protection --
// the platform-level gate in front of the Next.js application itself --
// rejects a request before the app (and therefore before
// requireStaffSession()) ever runs. It does NOT exercise, and cannot be
// used to draw any conclusion about, the application's own internal
// authorization check. That check is verified separately and
// independently by verifyStoreProvisioningAuthorization.ts (structural:
// requireStaffSession() is the unconditional first statement in both
// actions) and verifyStoreProvisioningUnauthenticatedAccess.ts
// (behavioral, against a local dev server with no platform-level gate
// in front of it at all, proving the app-level Proxy redirect holds
// independently of Vercel's own protection). All three must be read
// together for the full picture; none of them alone is sufficient.
//
// Usage: npx tsx scripts/verifyStoreProvisioningValidActionNoSession.ts

const PREVIEW_URL =
  "https://crossbar-os-staging-git-c-d7dd23-ljacobm1200-gmailcoms-projects.vercel.app/stores/new";

// Captured verbatim from a real authenticated browser session's actual
// outgoing fetch() call for this exact form (via a temporary
// window.fetch wrapper in the browser, read back afterward) -- not
// guessed or hand-derived from the build manifest, which would have
// been wrong: useActionState's bound-action reference id differs from
// the raw exported function's id in the server-reference-manifest.
const ACTION_ID = "60f9d801d9a51e94da183c25cb345f0f96d42fc13f";
const ROUTER_STATE_TREE =
  "%5B%22%22%2C%7B%22children%22%3A%5B%22(internal)%22%2C%7B%22children%22%3A%5B%22stores%22%2C%7B%22children%22%3A%5B%22new%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C16%5D";
const DUPLICATE_NAME = "ZZ TEST -- Phase1 Store Provisioning (safe to delete) (renamed)";

async function main() {
  const form = new FormData();
  form.append("_1_$ACTION_REF_2", "");
  form.append("_1_$ACTION_2:0", JSON.stringify({ id: ACTION_ID, bound: "$@1" }));
  form.append("_1_$ACTION_2:1", JSON.stringify([{ error: null }]));
  form.append("_1_$ACTION_KEY", "ke6a73f97c677f23fd8061e01096a4081");
  form.append("_1_name", DUPLICATE_NAME);
  form.append("_1_vendor_team_tag", "");
  form.append("_1_fundraiser_rate_percent", "20");
  form.append("_1_organization_type", "");
  form.append("_1_sport", "");
  form.append("_1_contact_name", "");
  form.append("_1_contact_email", "");
  form.append("_1_contact_phone", "");
  form.append("_1_notes", "");
  form.append("0", JSON.stringify([{ error: null }, "$K1"]));

  const res = await fetch(PREVIEW_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "text/x-component",
      "next-action": ACTION_ID,
      "next-router-state-tree": ROUTER_STATE_TREE,
      // Deliberately NO Cookie header -- this is the entire point.
    },
    body: form,
  });

  const location = res.headers.get("location") ?? "";
  const body = await res.text();

  console.log("status:", res.status);
  console.log("location:", location);
  console.log("body (first 200 chars):", body.slice(0, 200));

  const rejectedByVercelAuth =
    res.status === 302 && location.includes("vercel.com/sso-api") && body.includes("Protected by Vercel Authentication");

  if (rejectedByVercelAuth) {
    console.log("\nPASS: a valid, well-formed createOnlineStore invocation with no session was rejected at the Vercel platform layer, before ever reaching the application.");
  } else {
    console.error("\nFAIL: expected rejection at the Vercel Authentication layer; got something else.");
    process.exitCode = 1;
  }
}

main();
