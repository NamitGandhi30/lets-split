import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Env {
  supabaseUrl: string;
  /** Publishable (anon) key. The API talks to Postgres as the signed-in user, never as service role. */
  supabaseKey: string;
  allowedOrigins: string[];
}

type DenoLike = { env: { get(k: string): string | undefined } };

function read(name: string): string | undefined {
  const deno = (globalThis as { Deno?: DenoLike }).Deno;
  if (deno) return deno.env.get(name);
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[name];
}

export function envFromRuntime(): Env {
  const supabaseUrl = read("SUPABASE_URL");
  const supabaseKey = read("SUPABASE_PUBLISHABLE_KEY") ?? read("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  return {
    supabaseUrl,
    supabaseKey,
    allowedOrigins: (read("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/** A Supabase client that sends the user's JWT, so every query runs under row level security. */
export function userClient(env: Env, jwt: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

/** Verifies an access token and returns the user, or null if it's missing, expired or forged. */
export type VerifyToken = (env: Env, jwt: string) => Promise<AuthedUser | null>;

export const verifyWithSupabase: VerifyToken = async (env, jwt) => {
  const client = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // getClaims verifies the signature locally against the project's JWKS when it can,
  // and falls back to asking Auth.
  const { data, error } = await client.auth.getClaims(jwt);
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
};

export type AppVariables = {
  user: AuthedUser;
  db: SupabaseClient;
  env: Env;
};

export type AppEnv = { Variables: AppVariables };
