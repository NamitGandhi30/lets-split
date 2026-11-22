import { createRoute } from "@hono/zod-openapi";
import type { AppEnv } from "../context.ts";
import { must } from "../errors.ts";
import { toMe, type ProfileRow } from "../mappers.ts";
import { Me, MePatch } from "../schemas.ts";
import { errors, json, router } from "./util.ts";


export const meRoutes = router();

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/me",
    tags: ["me"],
    summary: "The signed-in user's profile",
    security: [{ Bearer: [] }],
    responses: { 200: json(Me, "Profile"), ...errors },
  }),
  async (c) => {
    const user = c.get("user");
    const row = must(
      await c.get("db").from("profiles").select("*").eq("id", user.id).single<ProfileRow>(),
    );
    return c.json(toMe(row, user.email), 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/me",
    tags: ["me"],
    summary: "Update name, avatar or UPI ID",
    security: [{ Bearer: [] }],
    request: { body: { content: { "application/json": { schema: MePatch } }, required: true } },
    responses: { 200: json(Me, "Updated profile"), ...errors },
  }),
  async (c) => {
    const user = c.get("user");
    const b = c.req.valid("json");
    const patch: Record<string, unknown> = {};
    if (b.displayName !== undefined) patch.display_name = b.displayName;
    if (b.avatarKey !== undefined) patch.avatar_key = b.avatarKey;
    if (b.avatarUrl !== undefined) patch.avatar_url = b.avatarUrl;
    if (b.upiId !== undefined) patch.upi_id = b.upiId?.trim().toLowerCase() ?? null;
    if (b.noUpi !== undefined) patch.no_upi = b.noUpi;
    if (b.noUpi === true) patch.upi_id = null;
    if (b.upiId) patch.no_upi = false;
    if (b.onboarded) patch.onboarded_at = new Date().toISOString();

    const db = c.get("db");
    const row = Object.keys(patch).length
      ? must(await db.from("profiles").update(patch).eq("id", user.id).select("*").single<ProfileRow>())
      : must(await db.from("profiles").select("*").eq("id", user.id).single<ProfileRow>());
    return c.json(toMe(row, user.email), 200);
  },
);
