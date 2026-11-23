import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { envFromRuntime, verifyWithSupabase, type AppEnv, type Env, type VerifyToken } from "./context.ts";
import { errorBody, handleError } from "./errors.ts";
import { idempotency, requireAuth } from "./middleware.ts";
import { expenseRoutes } from "./routes/expenses.ts";
import { fxRoutes } from "./routes/fx.ts";
import { groupRoutes } from "./routes/groups.ts";
import { meRoutes } from "./routes/me.ts";
import { pushRoutes } from "./routes/push.ts";
import { socialRoutes } from "./routes/social.ts";
import { statsRoutes } from "./routes/stats.ts";
import { wrappedRoutes } from "./routes/wrapped.ts";
import { router, validationHook } from "./routes/util.ts";

export const API_VERSION = "0.5.0";

export interface AppOptions {
  env?: () => Env;
  verify?: VerifyToken;
}

/**
 * The whole REST API. Supabase serves the function at /functions/v1/api, and the request path
 * the function sees starts with /api, so every route here lives under /api/v1.
 */
export function createApp(opts: AppOptions = {}) {
  let cached: Env | undefined;
  const getEnv = opts.env ?? (() => (cached ??= envFromRuntime()));
  const verify = opts.verify ?? verifyWithSupabase;

  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook }).basePath("/api");

  app.use("*", async (c, next) => {
    const origins = getEnv().allowedOrigins;
    return cors({
      origin: origins.includes("*") ? "*" : origins,
      allowHeaders: ["authorization", "content-type", "idempotency-key", "apikey", "x-client-info"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      exposeHeaders: ["idempotent-replayed"],
      maxAge: 86400,
    })(c, next);
  });

  app.get("/v1/health", (c) => c.json({ ok: true, version: API_VERSION }));

  app.openAPIRegistry.registerComponent("securitySchemes", "Bearer", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Supabase Auth access token from the email-code sign in.",
  });
  app.doc31("/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Let's Split API",
      version: API_VERSION,
      description:
        "Versioned REST API behind the Let's Split app. Money is always integer paise. " +
        "Every write accepts an Idempotency-Key header, and ids for new groups and expenses are generated on the device.",
    },
    servers: [{ url: "/functions/v1", description: "This Supabase project (paths start with /api/v1)" }],
  });

  const v1 = router();
  v1.use("*", requireAuth(getEnv, verify));
  v1.use("*", idempotency());
  v1.route("/", meRoutes);
  v1.route("/", groupRoutes);
  v1.route("/", expenseRoutes);
  v1.route("/", socialRoutes);
  v1.route("/", statsRoutes);
  v1.route("/", wrappedRoutes);
  v1.route("/", pushRoutes);
  v1.route("/", fxRoutes);
  app.route("/v1", v1);

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "No such endpoint."), 404));
  app.onError(handleError);
  return app;
}

export type App = ReturnType<typeof createApp>;
