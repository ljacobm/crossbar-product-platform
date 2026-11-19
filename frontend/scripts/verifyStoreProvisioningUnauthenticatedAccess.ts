// Creator 3.0, Phase 1 (Store Provisioning) -- behavioral authorization
// verification. Companion to verifyStoreProvisioningAuthorization.ts
// (the structural check). Run against a LOCAL dev server only
// (`npm run dev`), never against a deployed Preview or STAGING directly,
// since this issues raw unauthenticated HTTP requests.
//
// Usage: start the dev server, then `npx tsx
// scripts/verifyStoreProvisioningUnauthenticatedAccess.ts [baseUrl]`
// (baseUrl defaults to http://localhost:3000).
//
// WHY THIS SHAPE OF TEST: requireStaffSession() cannot be called directly
// from a plain script (next/headers' cookies() requires a real request
// context) without either mocking Next internals (a real test bypass) or
// weakening the check -- neither is acceptable. Instead this proves the
// property that actually matters end-to-end: an unauthenticated HTTP
// client, with zero cookies, cannot reach createOnlineStore or
// updateOnlineStore -- neither by loading the page first (GET), nor by
// attempting to forge a direct Server Action invocation (POST with a
// fabricated Next-Action header, skipping the page entirely). Both are
// rejected at the Next Proxy layer (app's own auth redirect) before ever
// reaching the action. This does not, by itself, prove
// requireStaffSession() inside the action would also reject an
// attacker -- that is what the structural test separately guarantees
// (it's unconditionally the first statement in both functions), so a
// request that somehow bypassed the Proxy layer would still be rejected
// independently. Together the two tests cover the same "no single point
// of failure" property this codebase's own docs/decisions.md requires.

const baseUrl = process.argv[2] ?? "http://localhost:3000";

let failures = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

async function assertRedirectsToLogin(response: Response, label: string) {
  if (response.status !== 307 && response.status !== 302) {
    throw new Error(`${label}: expected a redirect, got ${response.status}`);
  }
  const location = response.headers.get("location");
  if (location !== "/login") {
    throw new Error(`${label}: expected redirect to /login, got "${location}"`);
  }
}

async function main() {
  await check("unauthenticated GET /stores/new redirects to /login", async () => {
    const res = await fetch(`${baseUrl}/stores/new`, { redirect: "manual" });
    await assertRedirectsToLogin(res, "GET /stores/new");
  });

  await check("unauthenticated GET /stores/14/overview/edit redirects to /login", async () => {
    const res = await fetch(`${baseUrl}/stores/14/overview/edit`, { redirect: "manual" });
    await assertRedirectsToLogin(res, "GET /stores/14/overview/edit");
  });

  await check(
    "a forged direct Server Action POST to /stores/new (fabricated Next-Action header, no cookies) is rejected before reaching createOnlineStore",
    async () => {
      const res = await fetch(`${baseUrl}/stores/new`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Next-Action": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          Accept: "text/x-component",
          "Content-Type": "multipart/form-data; boundary=----x",
        },
        body: '------x\r\nContent-Disposition: form-data; name="0"\r\n\r\n[{}]\r\n------x--\r\n',
      });
      await assertRedirectsToLogin(res, "POST /stores/new");
    }
  );

  await check(
    "a forged direct Server Action POST to /stores/14/overview/edit (fabricated Next-Action header, no cookies) is rejected before reaching updateOnlineStore",
    async () => {
      const res = await fetch(`${baseUrl}/stores/14/overview/edit`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Next-Action": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          Accept: "text/x-component",
          "Content-Type": "multipart/form-data; boundary=----x",
        },
        body: '------x\r\nContent-Disposition: form-data; name="0"\r\n\r\n[{}]\r\n------x--\r\n',
      });
      await assertRedirectsToLogin(res, "POST /stores/14/overview/edit");
    }
  );

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll unauthenticated-access checks PASSED.");
  }
}

main();
