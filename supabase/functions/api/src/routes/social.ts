import { createRoute, z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, fromPg, must, notFound } from "../errors.ts";
import { toSettlement, type SettlementRow } from "../mappers.ts";
import { notifySettlement } from "../notify.ts";
import {
  ActivityFeed,
  IdempotencyHeader,
  InvitePreview,
  JoinRequest,
  JoinResult,
  Settlement,
  SettlementCreate,
  Uuid,
} from "../schemas.ts";
import { auth, body, errors, json, router } from "./util.ts";

/** Invites, settle-ups and the alerts feed. */
export const socialRoutes = router();

const Code = z.string().regex(/^[0-9a-f]{6,32}$/i).openapi({ param: { name: "code", in: "path" }, example: "a1b2c3d4e5f6" });
const GroupParams = z.object({ groupId: Uuid.openapi({ param: { name: "groupId", in: "path" } }) });

// ---------- invites ----------

interface PreviewRow {
  group_id: string; name: string; accent: string | null; emoji: string | null; location: string | null;
  starts_on: string | null; ends_on: string | null; archived: boolean; already_member: boolean;
  members: { id: string; display_name: string; avatar_key: string | null; placeholder: boolean }[];
}

socialRoutes.openapi(
  createRoute({
    method: "get",
    path: "/invites/{code}",
    tags: ["invites"],
    summary: "See the trip behind an invite link before joining",
    ...auth,
    request: { params: z.object({ code: Code }) },
    responses: { 200: json(InvitePreview, "The trip, its people and the placeholders you could claim"), ...errors },
  }),
  async (c) => {
    const { code } = c.req.valid("param");
    const { data, error } = await c.get("db").rpc("invite_preview", { p_code: code.toLowerCase() });
    if (error) throw fromPg(error);
    if (!data) throw notFound("That invite link doesn't work any more. Ask for a new one.");
    const p = data as PreviewRow;
    return c.json({
      groupId: p.group_id, name: p.name, accent: p.accent, emoji: p.emoji, location: p.location,
      startsOn: p.starts_on, endsOn: p.ends_on, archived: p.archived, alreadyMember: p.already_member,
      members: p.members.map((m) => ({ id: m.id, displayName: m.display_name, avatarKey: m.avatar_key, isPlaceholder: m.placeholder })),
    }, 200);
  },
);

socialRoutes.openapi(
  createRoute({
    method: "post",
    path: "/invites/{code}/join",
    tags: ["invites"],
    summary: "Join a trip, optionally claiming a placeholder so its history becomes yours",
    ...auth,
    request: { params: z.object({ code: Code }), headers: IdempotencyHeader, ...body(JoinRequest) },
    responses: { 200: json(JoinResult, "Joined (or already a member)"), 409: json(z.unknown(), "Spot already claimed"), ...errors },
  }),
  async (c) => {
    const { code } = c.req.valid("param");
    const b = c.req.valid("json");
    const { data, error } = await c.get("db").rpc("join_group", { p_code: code.toLowerCase(), p_claim_member: b.claimMemberId ?? null });
    if (error) {
      if (error.code === "P0002") throw notFound("That invite link doesn't work any more. Ask for a new one.");
      if (error.code === "23505") throw new ApiError(409, "ALREADY_CLAIMED", "Someone already claimed that spot.");
      throw fromPg(error);
    }
    const r = data as { group_id: string; member_id: string; already_member: boolean };
    return c.json({ groupId: r.group_id, memberId: r.member_id, alreadyMember: r.already_member }, 200);
  },
);

// ---------- settlements ----------

async function assertMember(db: SupabaseClient, groupId: string, me: string) {
  const { data, error } = await db.from("group_members").select("id").eq("group_id", groupId).eq("user_id", me).is("removed_at", null).maybeSingle();
  if (error) throw fromPg(error);
  if (!data) throw notFound("Group not found");
}

socialRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/settlements",
    tags: ["settlements"],
    summary: "Settle-ups recorded in a group, newest first",
    ...auth,
    request: { params: GroupParams },
    responses: { 200: json(z.object({ items: z.array(Settlement) }), "Settlements"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const { groupId } = c.req.valid("param");
    await assertMember(db, groupId, c.get("user").id);
    const rows = must(
      await db.from("settlements").select("*").eq("group_id", groupId).is("deleted_at", null).order("settled_at", { ascending: false }).returns<SettlementRow[]>(),
    );
    return c.json({ items: rows.map(toSettlement) }, 200);
  },
);

socialRoutes.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/settlements",
    tags: ["settlements"],
    summary: "Record a payment between two members (UPI, cash or other)",
    description: "Replaying the same `id` returns the original settlement with status 200.",
    ...auth,
    request: { params: GroupParams, headers: IdempotencyHeader, ...body(SettlementCreate) },
    responses: { 201: json(Settlement, "Recorded"), 200: json(Settlement, "Already recorded (replayed id)"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { groupId } = c.req.valid("param");
    const b = c.req.valid("json");
    if (b.fromMemberId === b.toMemberId) throw new ApiError(422, "SAME_MEMBER", "Someone can't pay themselves.");
    await assertMember(db, groupId, me);

    const existing = await db.from("settlements").select("*").eq("id", b.id).maybeSingle<SettlementRow>();
    if (existing.data) {
      if (existing.data.group_id !== groupId) throw new ApiError(409, "CONFLICT", "That id is already used.");
      return c.json(toSettlement(existing.data), 200);
    }
    const { data, error } = await db
      .from("settlements")
      .insert({
        id: b.id, group_id: groupId, from_member: b.fromMemberId, to_member: b.toMemberId,
        amount_paise: b.amountPaise, method: b.method, note: b.note ?? null,
        settled_at: b.settledAt ?? new Date().toISOString(), created_by: me,
      })
      .select("*")
      .single<SettlementRow>();
    if (error) {
      if (error.code === "23503") throw new ApiError(422, "UNKNOWN_MEMBER", "Both people must be in this group.");
      throw fromPg(error);
    }
    notifySettlement(db, me, groupId, { fromMemberId: b.fromMemberId, toMemberId: b.toMemberId, amountPaise: b.amountPaise, method: b.method });
    return c.json(toSettlement(data), 201);
  },
);

socialRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/settlements/{settlementId}",
    tags: ["settlements"],
    summary: "Undo a settle-up",
    ...auth,
    request: { params: z.object({ settlementId: Uuid.openapi({ param: { name: "settlementId", in: "path" } }) }), headers: IdempotencyHeader },
    responses: { 200: json(z.object({ id: Uuid }), "Deleted"), ...errors },
  }),
  async (c) => {
    const { settlementId } = c.req.valid("param");
    const db = c.get("db");
    const { data, error } = await db.from("settlements").select("id, deleted_at").eq("id", settlementId).maybeSingle<{ id: string; deleted_at: string | null }>();
    if (error) throw fromPg(error);
    if (!data) throw notFound("Settlement not found");
    if (!data.deleted_at) {
      const u = await db.from("settlements").update({ deleted_at: new Date().toISOString() }).eq("id", settlementId);
      if (u.error) throw fromPg(u.error);
    }
    return c.json({ id: settlementId }, 200);
  },
);

// ---------- activity ----------

interface ActivityRow {
  id: number; group_id: string; actor_id: string | null; kind: string; entity_id: string | null;
  data: Record<string, unknown>; created_at: string;
  groups: { name: string; accent: string | null } | null;
}

socialRoutes.openapi(
  createRoute({
    method: "get",
    path: "/activity",
    tags: ["activity"],
    summary: "Alerts across all my groups, newest first",
    description: "Settlement items carry `fromName`/`toName` in `data`. `unread` counts other people's actions since you last opened alerts.",
    ...auth,
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        groupId: Uuid.optional(),
      }),
    },
    responses: { 200: json(ActivityFeed, "Feed"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { limit, groupId } = c.req.valid("query");

    let q = db
      .from("activity")
      .select("id, group_id, actor_id, kind, entity_id, data, created_at, groups(name, accent)")
      .order("id", { ascending: false })
      .limit(limit);
    if (groupId) q = q.eq("group_id", groupId);
    const [rowsRes, profile] = await Promise.all([
      q.returns<ActivityRow[]>(),
      db.from("profiles").select("activity_seen_at").eq("id", me).single<{ activity_seen_at: string }>(),
    ]);
    if (rowsRes.error) throw fromPg(rowsRes.error);
    const rows = rowsRes.data ?? [];
    const seenAt = must(profile).activity_seen_at;

    const groupIds = [...new Set(rows.map((r) => r.group_id))];
    const members = groupIds.length
      ? must(
          await db
            .from("group_members")
            .select("id, group_id, user_id, display_name, avatar_key, profiles!group_members_user_id_fkey(avatar_key)")
            .in("group_id", groupIds)
            .returns<{ id: string; group_id: string; user_id: string | null; display_name: string; avatar_key: string | null; profiles: { avatar_key: string | null } | null }[]>(),
        )
      : [];
    const byId = new Map(members.map((m) => [m.id, m]));
    const byUser = new Map(members.filter((m) => m.user_id).map((m) => [`${m.group_id}:${m.user_id}`, m]));
    const nameOf = (id: unknown) => {
      const m = byId.get(String(id));
      return m ? (m.user_id === me ? "you" : m.display_name) : "someone";
    };

    const items = rows.map((r) => {
      const actor = r.actor_id ? byUser.get(`${r.group_id}:${r.actor_id}`) : undefined;
      const data = { ...r.data };
      if (r.kind.startsWith("settlement.")) {
        data.fromName = nameOf(r.data.from_member);
        data.toName = nameOf(r.data.to_member);
        data.toMe = byId.get(String(r.data.to_member))?.user_id === me;
        data.fromMe = byId.get(String(r.data.from_member))?.user_id === me;
      }
      // The creator joining as owner reads better as "created the trip".
      if (r.kind === "member.added" && r.data.placeholder === false && actor?.id === r.entity_id) data.created = true;
      const isMine = r.actor_id === me;
      return {
        id: Number(r.id),
        groupId: r.group_id,
        groupName: r.groups?.name ?? "",
        groupAccent: r.groups?.accent ?? null,
        kind: r.kind,
        entityId: r.entity_id,
        actorId: r.actor_id,
        actorMemberId: actor?.id ?? null,
        actorName: actor ? actor.display_name : null,
        actorAvatarKey: actor ? (actor.avatar_key ?? actor.profiles?.avatar_key ?? null) : null,
        isMine,
        unread: !isMine && Date.parse(r.created_at) > Date.parse(seenAt),
        data,
        createdAt: r.created_at,
      };
    });
    return c.json({ items, unreadCount: items.filter((i) => i.unread).length, seenAt }, 200);
  },
);

socialRoutes.openapi(
  createRoute({
    method: "post",
    path: "/activity/seen",
    tags: ["activity"],
    summary: "Mark every alert as read (clears the red dot)",
    ...auth,
    responses: { 200: json(z.object({ seenAt: z.string() }), "Marked"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    // Use the newest alert's database timestamp as well as our clock, so clock skew between this
    // function and Postgres can't leave alerts looking unread.
    const latest = await db.from("activity").select("created_at").order("id", { ascending: false }).limit(1).maybeSingle<{ created_at: string }>();
    const now = Date.now();
    const newest = latest.data ? Date.parse(latest.data.created_at) : 0;
    const seenAt = new Date(Math.max(now, newest)).toISOString();
    const { error } = await db.from("profiles").update({ activity_seen_at: seenAt }).eq("id", c.get("user").id);
    if (error) throw fromPg(error);
    return c.json({ seenAt }, 200);
  },
);
