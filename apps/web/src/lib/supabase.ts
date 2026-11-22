import { createClient, type Session } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Used for Auth only (email code sign-in and the session). Data always goes through the REST API,
 * never straight to tables, so a native app can reuse the same backend.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
});

// Supabase's default storage key for this project.
const STORAGE_KEY = `sb-${new URL(env.supabaseUrl).hostname.split(".")[0]}-auth-token`;

/**
 * The session saved on this phone, even when its access token has run out. With no network the
 * token can't be renewed, so Supabase reports "no session", but it leaves the saved one in place.
 * It deletes it (and fires SIGNED_OUT) only when the server actually rejects it, so a saved session
 * means "still signed in, waiting for a network to renew".
 */
export function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session> | null;
    return s?.access_token && s.refresh_token && s.user ? (s as Session) : null;
  } catch {
    return null;
  }
}
