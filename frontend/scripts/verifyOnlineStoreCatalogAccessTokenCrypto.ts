import assert from "node:assert/strict";
import {
  generateRawCatalogAccessToken,
  hashCatalogAccessToken,
  isValidRawCatalogAccessTokenFormat,
  isValidCatalogAccessTokenHashFormat,
} from "@/lib/onlineStoreCatalogAccessTokenCrypto";

// Standalone verification mirroring scripts/verifyPortalTokens.ts, for
// the Online Store Builder's separate customer catalog access token.

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

run("generateRawCatalogAccessToken produces a 43-char base64url string", () => {
  const token = generateRawCatalogAccessToken();
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});

run("generateRawCatalogAccessToken is collision-free across many calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 10_000; i++) {
    seen.add(generateRawCatalogAccessToken());
  }
  assert.equal(seen.size, 10_000);
});

run("hashCatalogAccessToken produces a 64-char lowercase hex SHA-256 digest", () => {
  const hash = hashCatalogAccessToken("some-raw-token-value");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

run("hashCatalogAccessToken is deterministic for the same input", () => {
  const token = generateRawCatalogAccessToken();
  assert.equal(hashCatalogAccessToken(token), hashCatalogAccessToken(token));
});

run("hashCatalogAccessToken produces different hashes for different tokens", () => {
  assert.notEqual(hashCatalogAccessToken("token-a"), hashCatalogAccessToken("token-b"));
});

run("isValidRawCatalogAccessTokenFormat accepts a real generated token", () => {
  assert.equal(isValidRawCatalogAccessTokenFormat(generateRawCatalogAccessToken()), true);
});

run("isValidRawCatalogAccessTokenFormat rejects the wrong length", () => {
  assert.equal(isValidRawCatalogAccessTokenFormat("tooshort"), false);
});

run("isValidRawCatalogAccessTokenFormat rejects invalid characters", () => {
  assert.equal(isValidRawCatalogAccessTokenFormat("!".repeat(43)), false);
});

run("isValidCatalogAccessTokenHashFormat matches the database's own check constraint shape", () => {
  const hash = hashCatalogAccessToken("anything");
  assert.equal(isValidCatalogAccessTokenHashFormat(hash), true);
  assert.equal(isValidCatalogAccessTokenHashFormat("not-a-hash"), false);
  assert.equal(isValidCatalogAccessTokenHashFormat(hash.toUpperCase()), false);
});
