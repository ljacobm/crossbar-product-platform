import { randomBytes, createHash, createCipheriv, createDecipheriv } from "crypto";

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

// ---------------------------------------------------------------------
// Phase 4D, Slice 4B: a second, independent, encrypted copy of the raw
// token -- separate from token_hash above, which remains the only thing
// customer authentication ever checks. This encrypted copy exists
// purely so staff can retrieve and re-display the same active link
// later, without ever storing the raw token in a form useful to anyone
// who doesn't also have PORTAL_TOKEN_ENCRYPTION_KEY (server-side only,
// read by lib/portalTokens.ts's `server-only`-guarded re-export, never
// NEXT_PUBLIC_-prefixed).
//
// AES-256-GCM: authenticated encryption, so a tampered or truncated
// stored value fails to decrypt (throws) rather than silently producing
// wrong bytes -- there is no code path here that returns a "maybe
// correct" plaintext. Encoded for storage as base64(iv || authTag ||
// ciphertext) in a single string -- see ENCRYPTION_ALGORITHM/IV_BYTES/
// AUTH_TAG_BYTES below for the fixed-width layout decryptPortalToken()
// relies on to split that string back apart.

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit IV, the standard/recommended size for GCM
const AUTH_TAG_BYTES = 16;

// Decodes and validates PORTAL_TOKEN_ENCRYPTION_KEY's base64 value into
// exactly ENCRYPTION_KEY_BYTES of raw key material. Throws -- rather
// than falling back to any derived/default key -- on anything else
// (unset, malformed base64, wrong length): there is no safe "disabled"
// behavior for an encryption key the way there is for a boolean feature
// flag, so the caller (encryptPortalToken/decryptPortalToken) is
// expected to catch this and treat it as "the encrypted-copy feature is
// unavailable right now," never to invent a substitute key. The thrown
// message never includes the attempted value.
export type PortalEncryptionEnv = {
  PORTAL_TOKEN_ENCRYPTION_KEY?: string;
  // Index signature so this type structurally matches NodeJS.ProcessEnv
  // (also index-signature-shaped) without TypeScript's "weak type" rule
  // (an all-optional-properties type needs at least one matching named
  // property, not just index-signature compatibility, to be considered
  // related to another type) rejecting the two as unrelated -- the same
  // issue already solved this way for PortalFeatureEnv in
  // lib/portalFeatureFlagLogic.ts.
  [key: string]: string | undefined;
};

export function loadPortalEncryptionKey(env: PortalEncryptionEnv): Buffer {
  const raw = env.PORTAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("PORTAL_TOKEN_ENCRYPTION_KEY is not configured.");
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("PORTAL_TOKEN_ENCRYPTION_KEY is not valid base64.");
  }

  if (key.length !== ENCRYPTION_KEY_BYTES) {
    throw new Error(
      `PORTAL_TOKEN_ENCRYPTION_KEY must decode to ${ENCRYPTION_KEY_BYTES} bytes.`
    );
  }

  return key;
}

// Encrypts rawToken under a fresh random IV every call -- two
// encryptions of the identical token never produce the same stored
// string, so the ciphertext itself never becomes a stable identifier.
export function encryptPortalToken(rawToken: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

// Inverse of encryptPortalToken(). Throws (never returns a guessed or
// partial value) if the stored string is malformed, the key is wrong,
// or the auth tag doesn't verify -- any of which means the ciphertext
// cannot be trusted.
export function decryptPortalToken(storedValue: string, key: Buffer): string {
  const blob = Buffer.from(storedValue, "base64");
  if (blob.length <= IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Encrypted portal token value is too short to be valid.");
  }

  const iv = blob.subarray(0, IV_BYTES);
  const authTag = blob.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
