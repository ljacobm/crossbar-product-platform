import { randomBytes, createHash } from "crypto";

// Pure token generation/hashing/format-validation logic, deliberately
// without the `server-only` guard -- see lib/portalTokens.ts, the only
// module application code actually imports, which re-exports everything
// here behind that guard. Splitting it this way lets
// scripts/verifyPortalTokens.ts exercise the real logic directly: the
// `server-only` package works by resolving to a no-op under Next's
// "react-server" bundler condition and throwing unconditionally
// everywhere else (including plain `tsx`/node execution), so a script
// run outside Next's build pipeline can never import anything that
// carries that guard in its chain. No application code should import
// this file directly -- always go through lib/portalTokens.ts.

// 32 bytes = 256 bits of entropy, encoded as unpadded base64url --
// crypto.randomBytes(32).toString("base64url") always produces exactly
// 43 characters (256 bits / 6 bits-per-base64-char, rounded up).
const TOKEN_BYTES = 32;
const RAW_TOKEN_LENGTH = 43;
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generateRawPortalToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashPortalToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

// Cheap, pre-hash format check -- lets a caller reject an obviously
// malformed token (wrong length, invalid characters -- e.g. someone
// hand-typing or truncating a URL) before spending a hash + indexed
// database lookup on it. Never used as the actual authorization check by
// itself -- only hashPortalToken()'s output, looked up against the
// database, decides whether a token is valid.
export function isValidRawPortalTokenFormat(value: string): value is string {
  return value.length === RAW_TOKEN_LENGTH && RAW_TOKEN_PATTERN.test(value);
}

// Matches the database's own check constraint on token_hash -- used
// defensively before passing a hash into a query or the rotation RPC, so
// a malformed hash never reaches the database as anything other than an
// explicit application-level rejection.
export function isValidTokenHashFormat(value: string): value is string {
  return TOKEN_HASH_PATTERN.test(value);
}
