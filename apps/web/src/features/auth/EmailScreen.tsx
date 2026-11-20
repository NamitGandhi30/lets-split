import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { env } from "../../lib/env";
import { supabase } from "../../lib/supabase";
import { MailIcon } from "../../ui/icons";
import { AuthLayout, Cta } from "./AuthLayout";
import { friendlyAuthError } from "./errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function EmailScreen() {
  const nav = useNavigate();
  const [email, setEmail] = useState(() => sessionStorage.getItem("ls:email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = EMAIL.test(email.trim());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const addr = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(friendlyAuthError(error));
    try {
      sessionStorage.setItem("ls:email", addr);
      sessionStorage.setItem("ls:sentAt", String(Date.now()));
    } catch {
      /* private mode: fine */
    }
    nav("/login/code", { state: { email: addr } });
  }

  return (
    <AuthLayout
      eyebrow="Trips · friends · UPI"
      title={
        <>
          Split the trip,
          <br />
          not the friendship.
        </>
      }
      sub={`We'll email you a ${env.otpLength}-digit code. No passwords to remember.`}
    >
      <form onSubmit={submit} noValidate>
        <label htmlFor="email" className="text-[13px] font-semibold text-muted">
          Email
        </label>
        <div className="mt-2 flex h-14 items-center gap-3 rounded-[18px] bg-card px-4 ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-ink">
          <MailIcon className="shrink-0 text-muted" />
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-full w-full bg-transparent text-[16px] font-medium outline-none placeholder:text-[#B4B8C0]"
          />
        </div>
        <p role="alert" className="min-h-[22px] pt-2 text-[13px] font-medium text-neg">
          {error}
        </p>
        <Cta type="submit" disabled={!valid} busy={busy}>
          Send code
        </Cta>
        <p className="mt-4 text-center text-[12px] leading-[1.5] text-muted">
          New here? The same code creates your account.
        </p>
      </form>
    </AuthLayout>
  );
}
