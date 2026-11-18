import assert from "node:assert/strict";
import { isUniqueViolationError } from "../lib/postgresErrors";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run("requirement -- detects a real unique_violation (23505) from a duplicate active submission insert", () => {
  assert.equal(isUniqueViolationError({ code: "23505" }), true);
});

run("does not mistake an unrelated Postgres error code for a unique violation", () => {
  assert.equal(isUniqueViolationError({ code: "23503" }), false); // foreign_key_violation
  assert.equal(isUniqueViolationError({ code: "42501" }), false); // insufficient_privilege
});

run("handles a missing/null/undefined error without throwing", () => {
  assert.equal(isUniqueViolationError(null), false);
  assert.equal(isUniqueViolationError(undefined), false);
  assert.equal(isUniqueViolationError({}), false);
});
