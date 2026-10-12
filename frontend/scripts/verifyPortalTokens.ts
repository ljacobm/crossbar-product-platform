import assert from "node:assert/strict";
import {
  generateRawPortalToken,
  hashPortalToken,
  isValidRawPortalTokenFormat,
  isValidTokenHashFormat,
} from "@/lib/portalTokenCrypto";

// Standalone verification for the portal-token crypto logic (Phase 4D,
// Slice 1). Imports from lib/portalTokenCrypto.ts, not lib/portalTokens.ts
// -- the latter carries the `server-only` guard, which throws
// unconditionally outside Next's own bundler (it only resolves to a
// no-op under the "react-server" export condition Next sets internally),
// so a plain script can never import it. lib/portalTokenCrypto.ts holds
// the exact same logic without that guard, specifically so it stays
// testable here. Application code never imports portalTokenCrypto.ts
// directly -- only through lib/portalTokens.ts.
//
// This repo has no test framework installed (no jest/vitest/mocha in
// package.json) -- rather than add one for four pure functions, this is
// a plain, dependency-free script using node:assert, runnable the same
// way as every other script in this directory: `npx tsx
// scripts/verifyPortalTokens.ts`. Exits non-zero on any failure.

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

run("generateRawPortalToken produces a 43-char base64url string", () => {
  const token = generateRawPortalToken();
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});

run("generateRawPortalToken is not deterministic / collision-free across many calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 10_000; i++) {
    seen.add(generateRawPortalToken());
  }
  assert.equal(seen.size, 10_000);
});

run("hashPortalToken produces a 64-char lowercase hex SHA-256 digest", () => {
  const hash = hashPortalToken("some-raw-token-value");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

run("hashPortalToken is deterministic for the same input", () => {
  const token = generateRawPortalToken();
  assert.equal(hashPortalToken(token), hashPortalToken(token));
});

run("hashPortalToken produces different output for different input", () => {
  const a = hashPortalToken(generateRawPortalToken());
  const b = hashPortalToken(generateRawPortalToken());
  assert.notEqual(a, b);
});

run("hashPortalToken matches a known SHA-256 test vector", () => {
  // SHA-256("abc") is a standard, publicly documented test vector.
  assert.equal(
    hashPortalToken("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

run("isValidRawPortalTokenFormat accepts a real generated token", () => {
  assert.equal(isValidRawPortalTokenFormat(generateRawPortalToken()), true);
});

run("isValidRawPortalTokenFormat rejects malformed input", () => {
  assert.equal(isValidRawPortalTokenFormat(""), false);
  assert.equal(isValidRawPortalTokenFormat("too-short"), false);
  assert.equal(isValidRawPortalTokenFormat("a".repeat(44)), false); // one too long
  assert.equal(isValidRawPortalTokenFormat("a".repeat(42)), false); // one too short
  assert.equal(isValidRawPortalTokenFormat("!".repeat(43)), false); // invalid characters
  assert.equal(
    isValidRawPortalTokenFormat("' OR '1'='1" + "x".repeat(32)),
    false
  ); // injection-shaped junk, rejected on format alone
});

run("isValidTokenHashFormat accepts a real hash", () => {
  assert.equal(isValidTokenHashFormat(hashPortalToken("x")), true);
});

run("isValidTokenHashFormat rejects malformed input", () => {
  assert.equal(isValidTokenHashFormat(""), false);
  assert.equal(isValidTokenHashFormat("A".repeat(64)), false); // uppercase, not lowercase hex
  assert.equal(isValidTokenHashFormat("g".repeat(64)), false); // not a hex character
  assert.equal(isValidTokenHashFormat("f".repeat(63)), false); // one too short
  assert.equal(isValidTokenHashFormat("f".repeat(65)), false); // one too long
});

run("a raw token and its hash are never equal, and the hash never reveals the raw value", () => {
  const raw = generateRawPortalToken();
  const hash = hashPortalToken(raw);
  assert.notEqual(raw, hash);
  assert.equal(hash.includes(raw), false);
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll portal token checks passed.");
}
