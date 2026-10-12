import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  loadPortalEncryptionKey,
  encryptPortalToken,
  decryptPortalToken,
  generateRawPortalToken,
} from "@/lib/portalTokenCrypto";

// Phase 4D, Slice 4B: executable tests for the encrypted-copy helpers
// backing persistent, staff-retrievable portal links. Imports from
// lib/portalTokenCrypto.ts (no `server-only` guard), not
// lib/portalTokens.ts -- same constraint as verifyPortalTokens.ts and
// verifyPortalFeatureFlag.ts.
//
// Run via `npx tsx scripts/verifyPortalTokenEncryption.ts`.

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

const GOOD_KEY = randomBytes(32).toString("base64");

run("loadPortalEncryptionKey rejects an unset key", () => {
  assert.throws(() => loadPortalEncryptionKey({}));
});

run("loadPortalEncryptionKey rejects an empty-string key", () => {
  assert.throws(() => loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: "" }));
});

run("loadPortalEncryptionKey rejects a key of the wrong decoded length", () => {
  const tooShort = randomBytes(16).toString("base64");
  const tooLong = randomBytes(48).toString("base64");
  assert.throws(() => loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: tooShort }));
  assert.throws(() => loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: tooLong }));
});

run("loadPortalEncryptionKey accepts a valid base64-encoded 32-byte key", () => {
  const key = loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: GOOD_KEY });
  assert.equal(key.length, 32);
});

run("encrypt then decrypt round-trips to the original raw token", () => {
  const key = loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: GOOD_KEY });
  const rawToken = generateRawPortalToken();
  const encrypted = encryptPortalToken(rawToken, key);
  const decrypted = decryptPortalToken(encrypted, key);
  assert.equal(decrypted, rawToken);
});

run("encrypting the same token twice produces different stored values (random IV)", () => {
  const key = loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: GOOD_KEY });
  const rawToken = generateRawPortalToken();
  const first = encryptPortalToken(rawToken, key);
  const second = encryptPortalToken(rawToken, key);
  assert.notEqual(first, second);
  // Both must still independently decrypt to the same original value.
  assert.equal(decryptPortalToken(first, key), rawToken);
  assert.equal(decryptPortalToken(second, key), rawToken);
});

run("decrypting with the wrong key fails closed (throws, never returns wrong plaintext)", () => {
  const key = loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: GOOD_KEY });
  const wrongKey = loadPortalEncryptionKey({
    PORTAL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  });
  const rawToken = generateRawPortalToken();
  const encrypted = encryptPortalToken(rawToken, key);
  assert.throws(() => decryptPortalToken(encrypted, wrongKey));
});

run("a tampered ciphertext fails authentication and throws, rather than decrypting silently", () => {
  const key = loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: GOOD_KEY });
  const rawToken = generateRawPortalToken();
  const encrypted = encryptPortalToken(rawToken, key);

  const blob = Buffer.from(encrypted, "base64");
  // Flip one bit well inside the ciphertext region (past the 12-byte IV
  // and 16-byte auth tag) -- GCM's auth tag must catch this.
  blob[blob.length - 1] ^= 0xff;
  const tampered = blob.toString("base64");

  assert.throws(() => decryptPortalToken(tampered, key));
});

run("decrypting a too-short / malformed value throws rather than crashing unpredictably", () => {
  const key = loadPortalEncryptionKey({ PORTAL_TOKEN_ENCRYPTION_KEY: GOOD_KEY });
  assert.throws(() => decryptPortalToken("", key));
  assert.throws(() => decryptPortalToken(Buffer.from("short").toString("base64"), key));
});

if (process.exitCode === 1) {
  console.error("\nOne or more checks failed.");
} else {
  console.log("\nAll portal token encryption checks passed.");
}
