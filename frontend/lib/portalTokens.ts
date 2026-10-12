import "server-only";

// The actual application entry point for portal-token crypto -- every
// Server Action/data module imports from here, never from
// lib/portalTokenCrypto.ts directly, so the token generation/hashing
// logic that backs the customer portal's bearer credential (and, as of
// Phase 4D Slice 4B, the separate encrypted-copy helpers used for
// persistent staff retrieval) is never reachable from client-bundled
// code. See lib/portalTokenCrypto.ts for why the logic itself lives in
// a separate, unguarded module (so it can still be exercised by
// scripts/verifyPortalTokens.ts and
// scripts/verifyPortalTokenEncryption.ts, both of which run outside
// Next's bundler and therefore outside where `server-only`'s guard can
// do anything other than unconditionally throw).
export {
  generateRawPortalToken,
  hashPortalToken,
  isValidRawPortalTokenFormat,
  isValidTokenHashFormat,
  loadPortalEncryptionKey,
  encryptPortalToken,
  decryptPortalToken,
} from "./portalTokenCrypto";
