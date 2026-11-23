import { createRoute, z } from "@hono/zod-openapi";
import { ApiError, fromPg, notFound } from "../errors.ts";
import type { MemberRow } from "../mappers.ts";
import { sendNudge } from "../notify.ts";
import { pushAdmin, pushEnabled } from "../push.ts";
import { readEnv } from "../context.ts";
import { IdempotencyHeader, Uuid } from "../schemas.ts";
import { auth, body, errors, json, router } from "./util.ts";

/** Lock screen notifications (Web Push, iOS 16.4+ when installed to the Home Screen). */
export const pushRoutes = router();

const PushConfig = z
  .object({
    enabled: z.boolean().openapi({ description: "False when the server has no VAPID keys yet." }),
    publicKey: z.string().nullable().openapi({ description: "VAPID public key for PushManager.subscribe (base64url)." }),
  })
  .openapi("PushConfig");

const PushSubscriptionIn = z
  .object({
    endpoint: z.string().url().max(2000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  })
  .openapi("PushSubscriptionIn");

const PushEndpoint = z.object({ endpoint: z.string().url().max(2000) }).openapi("PushEndpoint");

const NudgeIn = z
  .object({
    memberId: Uuid,
    amountPaise: z.number().int().positive().max(10_000_000_000).optional(),
  })
  .openapi("NudgeIn");

const NudgeResult = z
  .object({ delivered: z.number().int().openapi({ description: "Devices that got the reminder. 0 means use WhatsApp instead." }) })
  .openapi("NudgeResult");

const GroupParams = z.object({ groupId: Uuid.openapi({ param: { name: "groupId", in: "path" } }) });

pushRoutes.openapi(
  createRoute({
    method: "get",
    path: "/push/config",
    tags: ["push"],
    summary: "Whether push is on, and the key to subscribe with",
    ...auth,
    responses: { 200: json(PushConfig, "Push config"), ...errors },
  }),
  (c) => c.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? (readEnv("VAPID_PUBLIC_KEY") ?? null) : null }, 200),
);

pushRoutes.openapi(
  createRoute({
    method: "put",
    path: "/push/subscription",
    tags: ["push"],
    summary: "Save this device's push subscription",
    ...auth,
    request: { headers: IdempotencyHeader, ...body(PushSubscriptionIn) },
    responses: { 200: json(z.object({ ok: z.literal(true) }), "Saved"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const b = c.req.valid("json");
    // One phone, one row: drop any older row for this endpoint (it may belong to an account
    // that signed out on this phone, which only the admin client can see).
    const admin = pushAdmin();
    if (admin) await admin.from("push_subscriptions").delete().eq("endpoint", b.endpoint);
    else await db.from("push_subscriptions").delete().eq("endpoint", b.endpoint);
    const { error } = await db.from("push_subscriptions").insert({ user_id: me, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth });
    if (error && error.code !== "23505") throw fromPg(error);
    return c.json({ ok: true as const }, 200);
  },
);

pushRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/push/subscription",
    tags: ["push"],
    summary: "Stop notifications on this device",
    ...auth,
    request: { headers: IdempotencyHeader, ...body(PushEndpoint) },
    responses: { 200: json(z.object({ ok: z.literal(true) }), "Removed"), ...errors },
  }),
  async (c) => {
    const { error } = await c.get("db").from("push_subscriptions").delete().eq("endpoint", c.req.valid("json").endpoint);
    if (error) throw fromPg(error);
    return c.json({ ok: true as const }, 200);
  },
);

pushRoutes.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/nudges",
    tags: ["push"],
    summary: "Send someone a settle-up reminder on their lock screen",
    description: "Returns how many of their devices got it. 0 means they haven't turned on notifications (or have no account yet).",
    ...auth,
    request: { params: GroupParams, headers: IdempotencyHeader, ...body(NudgeIn) },
    responses: { 200: json(NudgeResult, "Sent"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { groupId } = c.req.valid("param");
    const b = c.req.valid("json");
    const { data, error } = await db.from("group_members").select("*").eq("group_id", groupId).returns<MemberRow[]>();
    if (error) throw fromPg(error);
    if (!data?.some((m) => m.user_id === me && !m.removed_at)) throw notFound("Group not found");
    const target = data.find((m) => m.id === b.memberId && !m.removed_at);
    if (!target) throw new ApiError(422, "UNKNOWN_MEMBER", "That person isn't in this trip.");
    if (target.user_id === me) throw new ApiError(422, "SAME_MEMBER", "You can't remind yourself.");
    return c.json({ delivered: await sendNudge(db, me, groupId, target, b.amountPaise) }, 200);
  },
);
