"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, getStaffSession } from "@/lib/auth";

export type LoginFormState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export type VerifyCodeState = {
  status: "idle" | "error";
  message?: string;
};

const GENERIC_CODE_SENT_MESSAGE =
  "If that email is authorized, a sign-in code has been sent.";
const GENERIC_CODE_ERROR_MESSAGE =
  "Invalid or expired code. Please request a new one.";
const GENERIC_ACCESS_DENIED_MESSAGE = "Unable to sign in with that account.";

// Sends an eight-digit email OTP. shouldCreateUser: false is a deliberate,
// explicit, code-level enforcement of "no public sign-up" -- it does not
// rely solely on the "Allow new user signups" project setting (which
// someone could later flip without realizing it reopens this gap). Even if
// the email isn't a real/authorized account, the response is identical
// either way -- never reveal whether an email has an account or is on the
// staff allowlist.
//
// Supabase issues both a one-time code and a confirmation URL on every
// signInWithOtp call; which one actually reaches the user is controlled by
// the Auth email template (Token vs ConfirmationURL), not by this call.
export async function requestLoginCode(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    return { status: "error", message: "Email is required." };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: siteUrl ? `${siteUrl}/auth/callback` : undefined,
    },
  });

  return { status: "sent", message: GENERIC_CODE_SENT_MESSAGE };
}

// Verifies the eight-digit code against Supabase Auth. A valid code only
// proves the email's Supabase Auth identity -- it does not by itself grant
// internal access. staff_allowlist membership is checked explicitly here
// before redirecting, and the brand-new session is torn down immediately
// if the check fails, so an authenticated-but-unauthorized session is never
// left standing. This mirrors (and does not replace) the independent
// requireStaffSession() checks already present in every protected
// layout/action/route/data-function.
export async function verifyLoginCode(
  _prevState: VerifyCodeState,
  formData: FormData
): Promise<VerifyCodeState> {
  const email = String(formData.get("email") || "").trim();
  const token = String(formData.get("token") || "").trim();

  if (!email || !token) {
    return { status: "error", message: GENERIC_CODE_ERROR_MESSAGE };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return { status: "error", message: GENERIC_CODE_ERROR_MESSAGE };
  }

  const staffSession = await getStaffSession();

  if (!staffSession) {
    await supabase.auth.signOut();
    return { status: "error", message: GENERIC_ACCESS_DENIED_MESSAGE };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
