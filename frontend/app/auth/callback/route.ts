import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth";

// Publicly reachable -- this is the redirect target Supabase's magic-link
// email points at, hit before a session cookie exists. Exchanges the
// one-time code for a session; does not itself check staff_allowlist
// membership (that happens on the very next request, via the proxy's
// redirect-if-unauthenticated plus requireStaffSession() everywhere that
// actually matters).
//
// Any failure here -- Supabase appending an error directly to the
// redirect (an already-used or genuinely expired link), a missing code,
// or exchangeCodeForSession() itself failing -- sends the user back to
// /login with a single generic reason code (?error=expired) rather than a
// stack trace or a blank/confusing redirect to /dashboard. Deliberately
// one generic code for every failure mode here, same non-disclosure
// principle as requestMagicLink()'s uniform response: the exact reason
// (expired vs. already used vs. malformed) isn't worth distinguishing to
// the user and isn't anything they can act on differently anyway.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabaseError = request.nextUrl.searchParams.get("error");

  if (!code || supabaseError) {
    return NextResponse.redirect(new URL("/login?error=expired", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=expired", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
