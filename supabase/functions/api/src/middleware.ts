import type { MiddlewareHandler } from "hono";
import { userClient, type AppEnv, type Env, type VerifyToken } from "./context.ts";
import { errorBody } from "./errors.ts";

/** Requires `Authorization: Bearer <access token>` and attaches the user and a JWT-scoped DB client. */
export function requireAuth(getEnv: () => Env, verify: VerifyToken): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) return c.json(errorBody("UNAUTHENTICATED", "Sign in first."), 401);
    const env = getEnv();
    const user = await verify(env, m[1]!);
    if (!user) return c.json(errorBody("UNAUTHENTICATED", "Your session has expired. Sign in again."), 401);
    c.set("env", env);
    c.set("user", user);
    c.set("db", userClient(env, m[1]!));
    await next();
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `Idempotency-Key` on write requests: the first response is stored (per user, under RLS) and
 * replays return it unchanged, so a flaky network retry never writes twice.
 */
export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header("idempotency-key");
    if (!key || c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") return next();
    if (!UUID.test(key)) return c.json(errorBody("VALIDATION", "Idempotency-Key must be a UUID."), 400);

    const db = c.get("db");
    const path = new URL(c.req.url).pathname;
    const { data: seen } = await db
      .from("idempotency_keys")
      .select("method, path, status, response")
      .eq("key", key)
      .maybeSingle();
    if (seen) {
      if (seen.method !== c.req.method || seen.path !== path) {
        return c.json(errorBody("IDEMPOTENCY_MISMATCH", "That Idempotency-Key was used for a different request."), 422);
      }
      c.header("Idempotent-Replayed", "true");
      return c.json(seen.response, seen.status as 200);
    }

    await next();

    const status = c.res.status;
    if (status >= 500 || status === 401) return; // let the client retry these
    let body: unknown = null;
    try {
      body = await c.res.clone().json();
    } catch {
      body = null;
    }
    // A concurrent duplicate loses the primary-key race and is simply not stored.
    await db.from("idempotency_keys").insert({ key, method: c.req.method, path, status, response: body });
  };
}
