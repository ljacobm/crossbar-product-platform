import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/auth";

// This layout wraps every internal page (everything under app/(internal)/
// -- the route group adds no path segment, so URLs are unchanged). It's
// deliberately minimal: no visual chrome here -- each page already
// renders its own <Sidebar/> + wrapper, matching this app's existing
// convention. This layout's only job is the auth gate: a Server Component
// render that calls the real, DB-backed requireStaffSession() check
// directly, independent of middleware. If middleware had a matcher bug or
// were bypassed somehow, a request still can't render any internal page
// without passing this check too.
export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireStaffSession();
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
