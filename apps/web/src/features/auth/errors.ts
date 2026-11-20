import type { AuthError } from "@supabase/supabase-js";

/** Seconds left in Supabase's per-address cooldown ("…you can only request this after 42 seconds."). */
export function cooldownSeconds(e: AuthError): number | null {
  const m = /after (\d+) seconds?/i.exec(e.message ?? "");
  return m ? Number(m[1]) : null;
}

/** Human copy for the Auth errors people actually hit. */
export function friendlyAuthError(e: AuthError): string {
  const code = e.code ?? "";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || e.status === 429) {
    const wait = cooldownSeconds(e);
    if (wait !== null) return `A code was just sent. You can ask for another in ${wait}s.`;
    // Project-wide email cap. With Supabase's built-in mailer this is only 2 emails an hour.
    return import.meta.env.DEV
      ? "Email limit reached for this hour (Supabase's built-in mailer allows 2/hour; set up Brevo, see docs/SETUP-AUTH.md)."
      : "We've sent too many emails in the last hour. Please try again a bit later.";
  }
  if (code === "otp_expired") return "That code has expired or is wrong. Check it, or send a new one.";
  if (code === "email_address_invalid") return "That email address doesn't look right.";
  if (code === "email_address_not_authorized")
    return "Email sending isn't set up for this address yet (custom SMTP needed).";
  if (code === "signup_disabled") return "New sign-ups are turned off.";
  if (e.message?.toLowerCase().includes("fetch")) return "You seem to be offline. Check your connection.";
  return e.message || "Something went wrong. Try again.";
}
