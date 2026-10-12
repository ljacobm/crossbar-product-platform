import "server-only";

// Phase 4D, Slice 2 correction: the actual, enforced gate on portal
// token generation/regeneration -- not just a client-side UI disable.
// PORTAL_PUBLIC_ROUTE_ENABLED is deliberately NOT prefixed NEXT_PUBLIC_:
// that prefix would inline its value into the client bundle at build
// time, which is exactly what must not happen for a flag whose entire
// purpose is to be checked server-side, inside a Server Action, after
// requireStaffSession() and before any database write. Defaults to
// disabled (false) whenever unset, so a missing/misconfigured
// environment variable fails closed, not open -- generation stays off
// until explicitly turned on once the customer-facing /portal/[token]
// route exists.
//
// The one thing this module does expose outward is the boolean return
// value of isPortalGenerationEnabled() itself -- not a secret, just a
// yes/no -- which the Overview page (a Server Component) reads and
// passes down to PortalLinkSection (a Client Component) as an ordinary
// prop, so the UI's disabled state and the server's actual enforcement
// can never drift out of sync with each other.
export function isPortalGenerationEnabled(): boolean {
  return process.env.PORTAL_PUBLIC_ROUTE_ENABLED === "true";
}
