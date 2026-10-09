import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Defense-in-depth on top of the real protection dynamic rendering
  // already provides (every internal page reads cookies() via
  // requireStaffSession(), which already forces Next to render it
  // dynamically, never statically/cached -- confirmed in the build output).
  // This explicit header removes any dependence on that remaining true as
  // the app evolves (e.g. someone adding `export const revalidate` to a
  // page later without realizing the auth implication) by guaranteeing no
  // intermediary (browser, Vercel's edge) ever caches a staff- or
  // customer-specific response. Matches proxy.ts's own exclusion pattern
  // so the two stay in sync: everything except Next's static/image
  // internals and the favicon. Harmless on /login and the Shopify webhook
  // too -- neither benefits from caching, so one blanket rule is simpler
  // and safer than maintaining a second allowlist that could drift from
  // proxy.ts's.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
