// Single source of truth for Supabase Auth session cookie attributes,
// shared by every createServerClient() call site (lib/auth.ts, proxy.ts)
// so they can never drift from each other.
//
// Confirmed against the installed @supabase/ssr version (0.12.7, see
// node_modules/@supabase/ssr/dist/main/utils/constants.js): its own
// DEFAULT_COOKIE_OPTIONS is `{ path: "/", sameSite: "lax", httpOnly: false,
// maxAge: ... }` -- httpOnly is false by default, and `secure` isn't set
// at all. Passing `cookieOptions` into createServerClient()'s config
// merges on top of those defaults (confirmed in
// node_modules/@supabase/ssr/dist/main/cookies.js), which is what every
// call site below does with this constant.
//
// - httpOnly: true -- safe here specifically because this app never uses
//   a browser-side Supabase client (no createBrowserClient anywhere);
//   every Auth operation happens server-side (Server Components, Server
//   Actions, Route Handlers, Proxy), so nothing needs to read this cookie
//   via client-side JS. Making it httpOnly removes an otherwise-pointless
//   exposure to any future XSS.
// - secure: only in production -- a hard `true` would stop the browser
//   from ever sending the cookie back over plain http://localhost during
//   local development, breaking login testing. Vercel serves production
//   over HTTPS, so this is "secure everywhere that matters" without
//   breaking local dev.
// - sameSite: "lax" -- deliberately not "strict". The magic-link flow
//   depends on the session cookie surviving a top-level cross-site
//   navigation (clicking the link from a mail client/browser to
//   /auth/callback); "strict" risks the browser withholding the cookie on
//   exactly that navigation and breaking sign-in. "lax" is the correct,
//   standard choice for this flow, not a compromise.
export const SUPABASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};
