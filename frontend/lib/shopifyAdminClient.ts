// Shopify Admin API client for the standalone historical-import script.
// Deliberately has NO "server-only" import and NO dependency on
// lib/supabase-admin.ts -- this module is imported by
// frontend/scripts/backfillShopifyOrders.ts, which runs outside Next.js's
// bundler (via tsx), where "server-only"'s bundler-condition trick doesn't
// apply and would throw. See shopifyNormalized.ts for the corresponding
// note on why the Supabase client is passed in rather than imported there.

const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

if (!SHOP_DOMAIN) {
  throw new Error("Missing SHOPIFY_SHOP_DOMAIN environment variable.");
}
if (!CLIENT_ID) {
  throw new Error("Missing SHOPIFY_CLIENT_ID environment variable.");
}
if (!CLIENT_SECRET) {
  throw new Error("Missing SHOPIFY_CLIENT_SECRET environment variable.");
}

// Pinned Admin API version. Shopify stable versions are supported for a
// minimum of ~12 months -- bump this periodically and re-verify the query
// shapes in shopifyGraphQLAdapter.ts against the live schema when you do.
const API_VERSION = "2026-07";

// Re-fetch this many ms before the token's actual expiry, to avoid a race
// where a token expires mid-request.
const TOKEN_SAFETY_BUFFER_MS = 60_000;

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function fetchAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(`https://${SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID as string,
      client_secret: CLIENT_SECRET as string,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify token request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// Client credentials grant: exchanges client_id + client_secret for an
// Admin API access token, valid ~24h, no refresh token -- just re-request
// when expired. This only works for an app and store in the same Shopify
// organization (true for Crossbar OS's own custom app on its own store),
// and the token's actual permissions are exactly whatever scopes were
// granted to the app at install time -- this call does not itself grant
// read_all_orders or any other scope.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_BUFFER_MS > Date.now()) {
    return cachedToken.accessToken;
  }
  cachedToken = await fetchAccessToken();
  return cachedToken.accessToken;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GraphQLThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: { cost?: { throttleStatus?: GraphQLThrottleStatus } };
}

// Below this remaining cost-budget threshold, pause briefly before the next
// request rather than risk a throttled query. At this app's scale (a few
// thousand orders, low tens of pages) this is expected to rarely trigger --
// included for robustness, not because it's expected to matter often.
const THROTTLE_FLOOR = 100;

export async function shopifyAdminGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const accessToken = await getAccessToken();

  const response = await fetch(`https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL request failed (${response.status}): ${text}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors && result.errors.length > 0) {
    throw new Error(`Shopify GraphQL errors: ${result.errors.map((e) => e.message).join("; ")}`);
  }

  if (result.data === undefined) {
    throw new Error("Shopify GraphQL response had no data and no errors.");
  }

  const throttleStatus = result.extensions?.cost?.throttleStatus;
  if (throttleStatus && throttleStatus.currentlyAvailable < THROTTLE_FLOOR) {
    const deficit = THROTTLE_FLOOR - throttleStatus.currentlyAvailable;
    const waitMs = Math.ceil((deficit / Math.max(throttleStatus.restoreRate, 1)) * 1000);
    await sleep(waitMs);
  }

  return result.data;
}

export const SHOPIFY_API_VERSION = API_VERSION;
