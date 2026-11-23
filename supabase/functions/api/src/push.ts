import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { readEnv } from "./context.ts";

/** One lock screen notification. `url` is the in-app path opened when it's tapped. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Same tag replaces an older notification instead of stacking (e.g. one per trip). */
  tag?: string;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushConfig {
  admin: SupabaseClient;
}

let configured: PushConfig | null | undefined;

/** Projects on the new API keys get SUPABASE_SECRET_KEYS = {"default": "sb_secret_…"}. */
function secretKey(): string | undefined {
  try {
    const keys = JSON.parse(readEnv("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return keys.default ?? Object.values(keys)[0];
  } catch {
    return undefined;
  }
}

/**
 * Push needs the VAPID key pair and the service-role key: other people's subscriptions are
 * private to them (RLS), so only this module reads them, and only for users the caller
 * shares a trip with. Missing config (local dev, tests) turns push into a no-op.
 */
function config(): PushConfig | null {
  if (configured !== undefined) return configured;
  const url = readEnv("SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? secretKey();
  const publicKey = readEnv("VAPID_PUBLIC_KEY");
  const privateKey = readEnv("VAPID_PRIVATE_KEY");
  const subject = readEnv("VAPID_SUBJECT") ?? "https://lets-split-app.vercel.app";
  if (!url || !serviceKey || !publicKey || !privateKey) return (configured = null);
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = {
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
  };
  return configured;
}

export const pushEnabled = () => config() !== null;

/** Admin client for subscription bookkeeping, or null when push isn't configured. */
export const pushAdmin = () => config()?.admin ?? null;

/**
 * Sends each user their own message. Dead subscriptions (app deleted, permission revoked)
 * are removed. Never throws: a failed push must not fail the write that caused it.
 * Returns how many devices accepted a notification.
 */
export async function sendPush(messages: Map<string, PushMessage>): Promise<number> {
  const cfg = config();
  if (!cfg || messages.size === 0) return 0;
  try {
    const { data, error } = await cfg.admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", [...messages.keys()])
      .returns<SubRow[]>();
    if (error || !data?.length) return 0;
    const dead: string[] = [];
    const results = await Promise.all(
      data.map(async (s) => {
        const msg = messages.get(s.user_id)!;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), {
            TTL: 60 * 60 * 24,
            urgency: "normal",
            ...(msg.tag ? { topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
          });
          return 1;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.id);
          else console.warn("push failed", code ?? (e as Error).message);
          return 0;
        }
      }),
    );
    if (dead.length) await cfg.admin.from("push_subscriptions").delete().in("id", dead);
    return results.reduce<number>((a, b) => a + b, 0);
  } catch (e) {
    console.warn("push error", (e as Error).message);
    return 0;
  }
}

type EdgeRuntimeLike = { waitUntil(p: Promise<unknown>): void };

/** Lets the response go out now and finishes sending in the background. */
export function inBackground(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;
  const safe = p.catch((e) => console.warn("background task failed", (e as Error).message));
  if (rt?.waitUntil) rt.waitUntil(safe);
}

const rupees = (paise: number) => {
  const r = paise / 100;
  return "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
};
export { rupees as pushRupees };
