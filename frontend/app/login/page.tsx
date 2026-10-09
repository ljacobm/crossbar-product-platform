"use client";

import { useEffect, useState, use, useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestLoginCode,
  verifyLoginCode,
  type LoginFormState,
  type VerifyCodeState,
} from "@/app/login/actions";

const initialRequestState: LoginFormState = { status: "idle" };
const initialVerifyState: VerifyCodeState = { status: "idle" };

const RESEND_COOLDOWN_SECONDS = 30;

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  expired:
    "Your sign-in link has expired or already been used. Enter your email below to request a new one.",
};

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[#860132] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ResendButton({ cooldown }: { cooldown: number }) {
  const { pending } = useFormStatus();
  const disabled = pending || cooldown > 0;
  return (
    <button
      type="submit"
      disabled={disabled}
      className="text-sm text-slate-500 underline hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
    >
      {pending ? "Sending..." : cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
    </button>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [requestState, requestAction] = useActionState(requestLoginCode, initialRequestState);
  const [verifyState, verifyAction] = useActionState(verifyLoginCode, initialVerifyState);
  const [email, setEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const { error: callbackErrorCode } = use(searchParams);
  const callbackError = callbackErrorCode ? CALLBACK_ERROR_MESSAGES[callbackErrorCode] : undefined;

  const codeSent = requestState.status === "sent";

  useEffect(() => {
    if (requestState.status === "sent") {
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }, [requestState]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow">
        <h1 className="text-xl font-bold text-slate-900">Crossbar OS</h1>
        <p className="mt-1 text-sm text-slate-500">Staff sign-in</p>

        {!codeSent ? (
          <form action={requestAction} className="mt-6 space-y-4">
            {callbackError && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {callbackError}
              </p>
            )}

            {requestState.status === "error" && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {requestState.message}
              </p>
            )}

            <label className="block text-sm text-slate-600">
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#860132]"
              />
            </label>

            <SubmitButton label="Send sign-in code" pendingLabel="Sending..." />
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {requestState.message}
            </p>

            <form action={verifyAction} className="space-y-4">
              <input type="hidden" name="email" value={email} />

              {verifyState.status === "error" && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {verifyState.message}
                </p>
              )}

              <label className="block text-sm text-slate-600">
                8-digit code
                <input
                  type="text"
                  name="token"
                  inputMode="numeric"
                  pattern="[0-9]{8}"
                  maxLength={8}
                  required
                  autoComplete="one-time-code"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest outline-none focus:border-[#860132]"
                />
              </label>

              <SubmitButton label="Verify code" pendingLabel="Verifying..." />
            </form>

            <form action={requestAction} className="flex justify-center">
              <input type="hidden" name="email" value={email} />
              <ResendButton cooldown={cooldown} />
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
