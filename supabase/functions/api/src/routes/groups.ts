import { createRoute, z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../context.ts";
import { fromPg, must, notFound } from "../errors.ts";
import { toGroup, toGroupMember, toMember, type GroupRow, type MemberProfileRow, type MemberRow } from "../mappers.ts";
import { Group, GroupCreate, GroupPatch, IdempotencyHeader, Invite, Member, MemberCreate, MemberPatch, MemberWithPay, Uuid } from "../schemas.ts";
import { auth, body, errors, json, router } from "./util.ts";

export const groupRoutes = router();

const GROUP_SELECT = "*, group_members(id, user_id, removed_at)";
const GroupParams = z.object({ groupId: Uuid.openapi({ param: { name: "groupId", in: "path" } }) });
const MemberParams = GroupParams.extend({ memberId: Uuid.openapi({ param: { name: "memberId", in: "path" } }) });

async function spentByGroup(db: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  const { data, error } = await db
    .from("expenses")
    .select("group_id, amount_paise")
    .in("group_id", ids)
    .is("deleted_at", null);
  if (error) throw fromPg(error);
  for (const r of data ?? []) out.set(r.group_id, (out.get(r.group_id) ?? 0) + Number(r.amount_paise));
  return out;
}

async function loadGroup(db: SupabaseClient, groupId: string, me: string) {
  const { data, error } = await db.from("groups").select(GROUP_SELECT).eq("id", groupId).maybeSingle<GroupRow>();
  if (error) throw fromPg(error);
  // Non-members get 404, not 403, so group ids can't be probed.
  if (!data || !(data.group_members ?? []).some((m) => m.user_id === me && m.removed_at === null)) {
    throw notFound("Group not found");
  }
  const spent = await spentByGroup(db, [groupId]);
  return toGroup(data, me, spent.get(groupId) ?? 0);
}

groupRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups",
    tags: ["groups"],
    summary: "Groups (trips) I'm in, newest first",
    ...auth,
    responses: { 200: json(z.object({ items: z.array(Group) }), "Groups"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const rows = must(
      await db.from("groups").select(GROUP_SELECT).order("created_at", { ascending: false }).returns<GroupRow[]>(),
    ).filter((g) => (g.group_members ?? []).some((m) => m.user_id === me && m.removed_at === null));
    const spent = await spentByGroup(db, rows.map((g) => g.id));
    return c.json({ items: rows.map((g) => toGroup(g, me, spent.get(g.id) ?? 0)) }, 200);
  },
);

groupRoutes.openapi(
  createRoute({
    method: "post",
    path: "/groups",
    tags: ["groups"],
    summary: "Create a group; you become its owner",
    ...auth,
    request: { headers: IdempotencyHeader, ...body(GroupCreate) },
    responses: { 201: json(Group, "Created (or the existing group, when the id is replayed)"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const b = c.req.valid("json");
    const { error } = await db.rpc("create_group", {
      p_id: b.id,
      p_name: b.name,
      p_emoji: b.emoji ?? null,
      p_accent: b.accent ?? null,
      p_type: b.type,
      p_location: b.location ?? null,
      p_starts_on: b.startsOn ?? null,
      p_ends_on: b.endsOn ?? null,
    });
    if (error) throw fromPg(error);
    return c.json(await loadGroup(db, b.id, me), 201);
  },
);

groupRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}",
    tags: ["groups"],
    summary: "One group",
    ...auth,
    request: { params: GroupParams },
    responses: { 200: json(Group, "Group"), ...errors },
  }),
  async (c) => c.json(await loadGroup(c.get("db"), c.req.valid("param").groupId, c.get("user").id), 200),
);

groupRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/groups/{groupId}",
    tags: ["groups"],
    summary: "Rename, re-colour or change settings",
    ...auth,
    request: { params: GroupParams, headers: IdempotencyHeader, ...body(GroupPatch) },
    responses: { 200: json(Group, "Updated group"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { groupId } = c.req.valid("param");
    const b = c.req.valid("json");
    const map: Record<string, string> = {
      name: "name", emoji: "emoji", accent: "accent", type: "type", location: "location",
      startsOn: "starts_on", endsOn: "ends_on", simplifyDebts: "simplify_debts",
    };
    const patch = Object.fromEntries(
      Object.entries(b).filter(([, v]) => v !== undefined).map(([k, v]) => [map[k]!, v]),
    );
    if (Object.keys(patch).length) {
      const { data, error } = await db.from("groups").update(patch).eq("id", groupId).select("id");
      if (error) throw fromPg(error);
      if (!data?.length) throw notFound("Group not found");
    }
    return c.json(await loadGroup(db, groupId, me), 200);
  },
);

// ---------- members ----------

groupRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/members",
    tags: ["members"],
    summary: "Members, including placeholders and removed members",
    ...auth,
    request: { params: GroupParams },
    responses: { 200: json(z.object({ items: z.array(MemberWithPay) }), "Members, with each one's UPI ID for settling up"), ...errors },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const me = c.get("user").id;
    const rows = must(
      await c
        .get("db")
        .from("group_members")
        .select("*, profiles!group_members_user_id_fkey(upi_id, no_upi, avatar_key)")
        .eq("group_id", groupId)
        .order("created_at")
        .returns<MemberProfileRow[]>(),
    );
    if (!rows.some((m) => m.user_id === me && m.removed_at === null)) throw notFound("Group not found");
    return c.json({ items: rows.map((m) => toGroupMember(m, me)) }, 200);
  },
);

groupRoutes.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/members",
    tags: ["members"],
    summary: "Add a placeholder member (someone who hasn't joined yet)",
    ...auth,
    request: { params: GroupParams, headers: IdempotencyHeader, ...body(MemberCreate) },
    responses: { 201: json(Member, "Added"), ...errors },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const b = c.req.valid("json");
    const { data, error } = await c
      .get("db")
      .from("group_members")
      .insert({ group_id: groupId, display_name: b.displayName, avatar_key: b.avatarKey ?? null })
      .select("*")
      .single<MemberRow>();
    // RLS refuses inserts into groups you're not in; report that as not found.
    if (error) throw error.code === "42501" ? notFound("Group not found") : fromPg(error);
    return c.json(toMember(data, c.get("user").id), 201);
  },
);

groupRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/groups/{groupId}/members/{memberId}",
    tags: ["members"],
    summary: "Rename a member, change their avatar, or remove them",
    ...auth,
    request: { params: MemberParams, headers: IdempotencyHeader, ...body(MemberPatch) },
    responses: { 200: json(Member, "Updated"), ...errors },
  }),
  async (c) => {
    const { groupId, memberId } = c.req.valid("param");
    const b = c.req.valid("json");
    const patch: Record<string, unknown> = {};
    if (b.displayName !== undefined) patch.display_name = b.displayName;
    if (b.avatarKey !== undefined) patch.avatar_key = b.avatarKey;
    if (b.removed !== undefined) patch.removed_at = b.removed ? new Date().toISOString() : null;
    const db = c.get("db");
    const q = Object.keys(patch).length
      ? db.from("group_members").update(patch).eq("id", memberId).eq("group_id", groupId).select("*")
      : db.from("group_members").select("*").eq("id", memberId).eq("group_id", groupId);
    const { data, error } = await q.maybeSingle<MemberRow>();
    if (error) throw fromPg(error);
    if (!data) throw notFound("Member not found");
    return c.json(toMember(data, c.get("user").id), 200);
  },
);

groupRoutes.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/archive",
    tags: ["groups"],
    summary: "Archive (or unarchive) a trip",
    ...auth,
    request: { params: GroupParams, headers: IdempotencyHeader, ...body(z.object({ archived: z.boolean().default(true) }).strict()) },
    responses: { 200: json(Group, "Updated group"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const { groupId } = c.req.valid("param");
    const { archived } = c.req.valid("json");
    const { data, error } = await db
      .from("groups")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", groupId)
      .select("id");
    if (error) throw fromPg(error);
    if (!data?.length) throw notFound("Group not found");
    return c.json(await loadGroup(db, groupId, c.get("user").id), 200);
  },
);

groupRoutes.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/invite",
    tags: ["invites"],
    summary: "Make a new invite code; the old link stops working",
    ...auth,
    request: { params: GroupParams, headers: IdempotencyHeader },
    responses: { 200: json(Invite, "The new code"), ...errors },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const { data, error } = await c.get("db").rpc("rotate_invite", { p_group: groupId });
    if (error) throw error.code === "42501" ? notFound("Group not found") : fromPg(error);
    return c.json({ inviteCode: data as string }, 200);
  },
);
