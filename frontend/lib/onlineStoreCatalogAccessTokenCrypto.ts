import { randomBytes, createHash } from "crypto";

// Pure token generation/hashing/format-validation for Online Store
// Builder customer catalog access -- deliberately without the
// `server-only` guard, same split as lib/portalTokenCrypto.ts, so
// scripts/verifyOnlineStoreCatalogAccessTokenCrypto.ts can exercise the
// real logic directly. No application code should import this file
// directly -- always go through lib/onlineStoreCatalogAccess.ts.
//
// Deliberately NOT copying portalTokenCrypto.ts's later encrypted-
// retrievable-copy addition (AES-256-GCM encryptPortalToken/
// decryptPortalToken) -- out of scope for this phase; the raw token is
// shown to staff exactly once, at generation/rotation time (see
// app/(internal)/stores/[storeId]/catalogAccessActions.ts), matching
// how the portal link originally worked before that addition existed.

const TOKEN_BYTES = 32;
const RAW_TOKEN_LENGTH = 43;
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generateRawCatalogAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashCatalogAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isValidRawCatalogAccessTokenFormat(value: string): value is string {
  return value.length === RAW_TOKEN_LENGTH && RAW_TOKEN_PATTERN.test(value);
}

export function isValidCatalogAccessTokenHashFormat(value: string): value is string {
  return TOKEN_HASH_PATTERN.test(value);
}
