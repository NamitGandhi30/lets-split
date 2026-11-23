import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { env } from "../../lib/env";
import { supabase } from "../../lib/supabase";
import { MailIcon } from "../../ui/icons";
import { AuthLayout, Cta } from "./AuthLayout";
import { cooldownSeconds, friendlyAuthError } from "./errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Common domain typos (someone typed gmai.com and never got a code). */
const TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com", "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gnail.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahooo.com": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "outlok.com": "outlook.com", "outlook.co": "outlook.com",
  "icoud.com": "icloud.com", "iclod.com": "icloud.com", "rediffmai.com": "rediffmail.com",
};

function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const fix = TYPOS[email.slice(at + 1).toLowerCase()];
  return fix ? email.slice(0, at + 1) + fix : null;
}

export function EmailScreen() {
  const nav = useNavigate();
  const [email, setEmail] = useState(() => sessionStorage.getItem("ls:email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = EMAIL.test(email.trim());
  const suggestion = suggestEmail(email.trim());

  const goToCode = (addr: string, sentAt = Date.now()) => {
    try {
      sessionStorage.setItem("ls:email", addr);
      sessionStorage.setItem("ls:sentAt", String(sentAt));
    } catch {
      /* private mode: fine */
    }
    nav("/login/code", { state: { email: addr } });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const addr = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      // Per-address cooldown means this address was emailed seconds ago: the code is on its way.
      const wait = cooldownSeconds(error);
      if (wait !== null) return goToCode(addr, Date.now() - (60 - wait) * 1000);
      return setError(friendlyAuthError(error));
    }
    goToCode(addr);
  }

  return (
    <AuthLayout
      onBack={() => nav("/login", { replace: true })}
      eyebrow="Sign in or sign up"
      title="What's your email?"
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
        {suggestion && !error ? (
          <p className="min-h-[22px] pt-2 text-[13px] font-medium text-muted">
            Did you mean{" "}
            <button type="button" onClick={() => setEmail(suggestion)} className="font-semibold text-ink underline underline-offset-2">
              {suggestion}
            </button>
            ?
          </p>
        ) : (
          <p role="alert" className="min-h-[22px] pt-2 text-[13px] font-medium text-neg">
            {error}
          </p>
        )}
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
