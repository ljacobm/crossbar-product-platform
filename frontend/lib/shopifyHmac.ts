import { createHmac, timingSafeEqual } from "crypto";

// Verifies a Shopify webhook's X-Shopify-Hmac-Sha256 header against the raw
// request body. Must be called with the exact raw bytes Shopify sent, before
// any JSON parsing -- re-stringifying a parsed body is not guaranteed to
// reproduce byte-for-byte what was signed.
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();

  try {
    const provided = Buffer.from(hmacHeader, "base64");
    return provided.length === digest.length && timingSafeEqual(digest, provided);
  } catch {
    // Malformed header (not valid base64, wrong length) -- treat as invalid,
    // never let this throw out of the caller.
    return false;
  }
}
