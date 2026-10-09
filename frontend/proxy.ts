import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabaseCookieOptions";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same
// NextRequest/NextResponse APIs, same config.matcher export -- confirmed
// against this project's installed Next.js version's own docs rather than
// assumed). Functionally this is the exact same convenience/UX layer
// described below; only the file/export name changed.
//
// Convenience/UX layer only: redirects an obviously-unauthenticated request
// to /login before a protected page even renders, and keeps the Supabase
// session cookie fresh. This is deliberately NOT the authoritative check --
// it only confirms "is there a valid Supabase Auth session" (a cheap,
// local JWT check), not full staff_allowlist membership (a DB lookup).
// The real, authoritative check is requireStaffSession() (lib/auth.ts),
// called independently inside every protected layout, Server Action,
// Route Handler, and "use server" data-access function -- so a user who
// passes this proxy check but isn't on the allowlist is still turned away
// everywhere that actually matters. Per explicit instruction, this app
// does not rely on this layer alone -- which also matches Next's own
// current guidance to avoid leaning on Proxy/Middleware when a more
// targeted API is available.
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/auth/callback",
  "/api/webhooks/shopify", // HMAC-verified independently; no Supabase session exists for Shopify's server-to-server calls.
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Proxy's cookie API is request/response-based, not next/headers'
      // cookies(), so it can't share lib/auth.ts's createSupabaseServerClient()
      // directly -- but it imports the same SUPABASE_COOKIE_OPTIONS constant
      // so the two never drift on httpOnly/secure/sameSite.
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() (not getSession()) revalidates against Supabase's Auth
  // server rather than trusting a possibly-stale decoded cookie, and also
  // triggers the token refresh that keeps the session alive across
  // navigations.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except Next's own static/image internals and the
     * favicon -- the allowlist above (PUBLIC_PATH_PREFIXES) handles the
     * app-level public routes.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
