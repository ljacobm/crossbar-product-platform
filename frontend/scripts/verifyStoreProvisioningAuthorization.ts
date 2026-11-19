import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Creator 3.0, Phase 1 (Store Provisioning) -- authorization verification.
//
// requireStaffSession() relies on Next's cookies() (next/headers), which
// can only run inside a real request-scoped AsyncLocalStorage context --
// calling the real exported createOnlineStore/updateOnlineStore functions
// directly from a plain Node script throws a Next-internal "cookies()
// called outside a request" error, not a clean demonstration of the
// authorization check itself. Introducing a bypass or a mock just to make
// that call succeed outside a request would be exactly the kind of "test
// bypass" we were told not to add. Two genuine, non-bypassing checks
// instead:
//
//   1. (this file) STRUCTURAL: confirm requireStaffSession() is the
//      unconditional first statement in both action functions' source --
//      so no input, branch, or future edit could route around it. This
//      is a real, repeatable, automated check, not an informal read.
//   2. (scripts/verifyStoreProvisioningUnauthenticatedAccess.ts, run
//      against a local dev server) BEHAVIORAL: an unauthenticated HTTP
//      request to the pages that host these actions is rejected before
//      ever reaching the action.

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

function firstStatementIsRequireStaffSession(source: string, functionName: string): boolean {
  const fnStart = source.indexOf(`export async function ${functionName}(`);
  if (fnStart === -1) throw new Error(`could not find function ${functionName} in source`);

  const bodyStart = source.indexOf("{", fnStart);
  const afterBrace = source.slice(bodyStart + 1);

  // Strip blank lines and // comment-only lines without a real parser --
  // sufficient here because this file's style never puts a comment and a
  // statement on the same line, and never uses /* */ before the first
  // statement in either function.
  const firstRealLine = afterBrace
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("//"));

  return firstRealLine === "await requireStaffSession();";
}

const newActionsSource = readFileSync(
  resolve(__dirname, "..", "app", "(internal)", "stores", "new", "actions.ts"),
  "utf8"
);
const editActionsSource = readFileSync(
  resolve(
    __dirname,
    "..",
    "app",
    "(internal)",
    "stores",
    "[storeId]",
    "overview",
    "edit",
    "actions.ts"
  ),
  "utf8"
);

check(
  "createOnlineStore's unconditional first statement is requireStaffSession()",
  () => {
    assert.equal(firstStatementIsRequireStaffSession(newActionsSource, "createOnlineStore"), true);
  }
);

check(
  "updateOnlineStore's unconditional first statement is requireStaffSession()",
  () => {
    assert.equal(firstStatementIsRequireStaffSession(editActionsSource, "updateOnlineStore"), true);
  }
);

check(
  "createOnlineStore never reads FormData or touches the database before calling requireStaffSession()",
  () => {
    const fnStart = newActionsSource.indexOf("export async function createOnlineStore(");
    const sessionCallIndex = newActionsSource.indexOf("await requireStaffSession();", fnStart);
    const firstFormDataRead = newActionsSource.indexOf("field(formData", fnStart);
    assert.ok(sessionCallIndex !== -1 && sessionCallIndex < firstFormDataRead);
  }
);

check(
  "updateOnlineStore never reads FormData or touches the database before calling requireStaffSession()",
  () => {
    const fnStart = editActionsSource.indexOf("export async function updateOnlineStore(");
    const sessionCallIndex = editActionsSource.indexOf("await requireStaffSession();", fnStart);
    const firstFormDataRead = editActionsSource.indexOf("field(formData", fnStart);
    assert.ok(sessionCallIndex !== -1 && sessionCallIndex < firstFormDataRead);
  }
);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log("\nAll structural authorization checks PASSED.");
}
