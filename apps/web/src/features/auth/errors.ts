import type { AuthError } from "@supabase/supabase-js";

/** Human copy for the Auth errors people actually hit. */
export function friendlyAuthError(e: AuthError): string {
  const code = e.code ?? "";
  if (code === "over_email_send_rate_limit" || e.status === 429) return "Too many codes requested. Wait a minute and try again.";
  if (code === "otp_expired") return "That code has expired or is wrong. Check it, or send a new one.";
  if (code === "email_address_invalid") return "That email address doesn't look right.";
  if (code === "email_address_not_authorized")
    return "Email sending isn't set up for this address yet (custom SMTP needed).";
  if (code === "signup_disabled") return "New sign-ups are turned off.";
  if (e.message?.toLowerCase().includes("fetch")) return "You seem to be offline. Check your connection.";
  return e.message || "Something went wrong. Try again.";
}
