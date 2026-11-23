import { motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { env } from "../../lib/env";
import { supabase } from "../../lib/supabase";
import { bouncy } from "../../ui/motion";
import { AuthLayout, Cta } from "./AuthLayout";
import { friendlyAuthError } from "./errors";

const RESEND_AFTER = 60;

export function CodeScreen() {
  const nav = useNavigate();
  const loc = useLocation();
  const email = (loc.state as { email?: string } | null)?.email ?? sessionStorage.getItem("ls:email") ?? "";
  const N = env.otpLength;

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(() => {
    const sent = Number(sessionStorage.getItem("ls:sentAt") ?? 0);
    return Math.max(0, RESEND_AFTER - Math.floor((Date.now() - sent) / 1000));
  });
  const input = useRef<HTMLInputElement>(null);
  const shake = useAnimationControls();

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  useEffect(() => input.current?.focus(), []);

  async function verify(token: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (error) {
      setError(friendlyAuthError(error));
      setCode("");
      shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.35 } });
      input.current?.focus();
      return;
    }
    sessionStorage.removeItem("ls:sentAt");
    nav("/", { replace: true });
  }

  function onChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, N);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === N) void verify(digits);
  }

  async function resend() {
    if (left > 0) return;
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return setError(friendlyAuthError(error));
    sessionStorage.setItem("ls:sentAt", String(Date.now()));
    setLeft(RESEND_AFTER);
  }

  if (!email) return <Navigate to="/login/email" replace />;

  return (
    <AuthLayout
      eyebrow="Check your inbox"
      title="Enter the code"
      sub={
        <>
          We sent a {N}-digit code to <span className="font-semibold text-on-dark">{email}</span>.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === N) void verify(code);
        }}
      >
        {/* One real input (so iOS can autofill the code from Mail); the boxes are just its picture. */}
        <motion.label animate={shake} className="relative block" htmlFor="otp">
          <input
            ref={input}
            id="otp"
            value={code}
            onChange={(e) => onChange(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={N}
            aria-label={`${N}-digit code`}
            className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
          />
          <div className="flex justify-between gap-2" aria-hidden="true">
            {Array.from({ length: N }, (_, i) => {
              const ch = code[i];
              const active = i === Math.min(code.length, N - 1) && !busy;
              return (
                <div
                  key={i}
                  className={`grid h-16 flex-1 place-items-center rounded-[16px] bg-card text-[28px] font-bold ring-1 transition-shadow ${
                    error ? "ring-neg/60" : active ? "ring-2 ring-ink" : "ring-black/5"
                  }`}
                >
                  {ch ? (
                    <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={bouncy}>
                      {ch}
                    </motion.span>
                  ) : active ? (
                    <span className="h-7 w-[2px] animate-pulse rounded bg-ink" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </motion.label>

        <p role="alert" className="min-h-[22px] pt-2 text-[13px] font-medium text-neg">
          {error}
        </p>

        <Cta type="submit" disabled={code.length !== N} busy={busy}>
          Sign in
        </Cta>

        <div className="mt-4 flex items-center justify-between text-[13px] font-medium">
          <button type="button" onClick={() => nav("/login/email")} className="text-muted">
            Use a different email
          </button>
          <button type="button" onClick={resend} disabled={left > 0} className="text-ink disabled:text-muted">
            {left > 0 ? `Resend in ${left}s` : "Resend code"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
