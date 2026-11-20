import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Used for Auth only (email code sign-in and the session). Data always goes through the REST API,
 * never straight to tables, so a native app can reuse the same backend.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
});
