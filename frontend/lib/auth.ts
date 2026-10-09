import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabaseCookieOptions";

// Staff authorization for Crossbar OS internal pages/actions/routes.
//
// `server-only` (not "use server") is the correct guard here: this module
// is a plain helper imported by other server-side code (layouts, Server
// Actions, route handlers, data modules), never invoked directly from a
// Client Component the way a form-bound Server Action is -- so it doesn't
// need the "use server" export-shape constraint, and server-only gives the
// same hard guarantee (a build error if anything ever tries to import this
// from client code) while still letting it export a plain type alongside
// its functions.
//
// IMPORTANT: a valid Supabase Auth session is NOT sufficient on its own.
// getStaffSession()/requireStaffSession() additionally require the
// session's user id to be an active row in `staff_allowlist`. There is no
// public sign-up path anywhere in this app; staff accounts are created
// directly in Supabase Auth (dashboard or a one-off admin script) and then
// added to the allowlist -- see the migration and the project README/docs
// for the exact procedure.

export interface StaffSession {
  userId: string;
  email: string;
}

// Request-scoped Supabase client that reads/writes the Auth session via
// Next's cookies() API. Uses the anon key -- Auth verification is what the
// anon key is for; it's unrelated to (and does not bypass) RLS on data
// tables, which stays exactly as it was. Exported so every Server
// Component/Server Action/Route Handler call site shares this exact
// implementation (and therefore the exact same cookie security
// attributes) instead of each re-implementing the cookie adapter --
// app/login/actions.ts and app/auth/callback/route.ts both import this
// rather than duplicating it. Proxy (proxy.ts) is the one legitimate
// exception: its cookie API is request/response-based, not next/headers'
// cookies(), so it keeps its own adapter but imports the same
// SUPABASE_COOKIE_OPTIONS constant to stay in sync.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called during a Server Component render, where cookies() is
            // read-only -- safe to ignore. Proxy refreshes the session
            // cookie on navigation, so this doesn't strand anyone.
          }
        },
      },
    }
  );
}

// Returns the current staff session if -- and only if -- there is a valid
// Supabase Auth session AND that user's id is an active row in
// staff_allowlist. This is the one function that enforces both checks
// together; every page/action/route/data-function that touches internal
// data calls this directly (or requireStaffSession() below), rather than
// trusting that some upstream layout or middleware already checked.
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: staffRow, error: allowlistError } = await supabaseAdmin
    .from("staff_allowlist")
    .select("user_id, email, active")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (allowlistError) {
    throw new Error(`Failed to check staff allowlist: ${allowlistError.message}`);
  }

  if (!staffRow) {
    // Valid Supabase login, but not an authorized staff account -- treated
    // identically to "not logged in" everywhere this is used.
    return null;
  }

  return { userId: staffRow.user_id, email: staffRow.email };
}

// Throws if there is no authorized staff session. Used directly inside
// Server Actions, Route Handlers, and "use server" data-access functions
// (where redirecting mid-mutation would be the wrong UX) -- callers in a
// page/layout context should catch and redirect("/login") instead, which
// is what app/(internal)/layout.tsx does.
export async function requireStaffSession(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) {
    throw new Error("Unauthorized: no active staff session.");
  }
  return session;
}
