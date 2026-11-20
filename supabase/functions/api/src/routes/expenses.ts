import { createRoute, z } from "@hono/zod-openapi";
import {
  computeExpense,
  netBalances,
  pairwiseDebts,
  simplifyDebts,
  type Allocation,
  type LedgerExpense,
  type SplitSpec,
} from "@lets-split/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../context.ts";
import { ApiError, fromPg, must, notFound } from "../errors.ts";
import { EXPENSE_SELECT, toExpense, type ExpenseRow, type MemberRow } from "../mappers.ts";
import { Balances, Expense, ExpenseCreate, ExpensePage, IdempotencyHeader, SplitInput, Uuid } from "../schemas.ts";
import { auth, body, errors, json, router } from "./util.ts";

export const expenseRoutes = router();

const GroupParams = z.object({ groupId: Uuid.openapi({ param: { name: "groupId", in: "path" } }) });
const ExpenseParams = z.object({ expenseId: Uuid.openapi({ param: { name: "expenseId", in: "path" } }) });

/** Active members of a group, or 404 if the caller isn't one of them. */
async function activeMembers(db: SupabaseClient, groupId: string, me: string): Promise<MemberRow[]> {
  const rows = must(
    await db.from("group_members").select("*").eq("group_id", groupId).order("created_at").returns<MemberRow[]>(),
  );
  if (!rows.some((m) => m.user_id === me && m.removed_at === null)) throw notFound("Group not found");
  return rows;
}

/** API split input (arrays, easy to describe in OpenAPI) -> core split spec (records). */
export function toSplitSpec(s: z.infer<typeof SplitInput>): SplitSpec {
  switch (s.type) {
    case "equal":
      return { type: "equal", members: s.members };
    case "exact":
      return { type: "exact", amounts: Object.fromEntries(s.amounts.map((a) => [a.memberId, a.amountPaise])) };
    case "percent":
      return { type: "percent", percents: Object.fromEntries(s.percents.map((p) => [p.memberId, p.percent])) };
    case "shares":
      return { type: "shares", shares: Object.fromEntries(s.shares.map((p) => [p.memberId, p.weight])) };
    case "adjustment":
      return {
        type: "adjustment",
        members: s.members,
        adjustments: Object.fromEntries(s.adjustments.map((a) => [a.memberId, a.amountPaise])),
      };
  }
}

function splitMemberIds(s: z.infer<typeof SplitInput>): string[] {
  switch (s.type) {
    case "equal":
      return s.members;
    case "exact":
      return s.amounts.map((a) => a.memberId);
    case "percent":
      return s.percents.map((p) => p.memberId);
    case "shares":
      return s.shares.map((p) => p.memberId);
    case "adjustment":
      return [...s.members, ...s.adjustments.map((a) => a.memberId)];
  }
}

const rows = (a: Allocation) => Object.entries(a).map(([member_id, amount_paise]) => ({ member_id, amount_paise }));

expenseRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/expenses",
    tags: ["expenses"],
    summary: "Expenses, newest first, with cursor paging",
    ...auth,
    request: {
      params: GroupParams,
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        cursor: z.string().max(200).optional().openapi({ description: "nextCursor from the previous page" }),
      }),
    },
    responses: { 200: json(ExpensePage, "A page of expenses"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const { groupId } = c.req.valid("param");
    const { limit, cursor } = c.req.valid("query");
    await activeMembers(db, groupId, c.get("user").id);

    let q = db
      .from("expenses")
      .select(EXPENSE_SELECT)
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("spent_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) {
      const [at, id] = JSON.parse(atob(cursor)) as [string, string];
      if (!Uuid.safeParse(id).success || Number.isNaN(Date.parse(at))) throw new ApiError(400, "VALIDATION", "Bad cursor");
      q = q.or(`spent_at.lt."${at}",and(spent_at.eq."${at}",id.lt.${id})`);
    }
    const data = must(await q.returns<ExpenseRow[]>());
    const page = data.slice(0, limit).map(toExpense);
    const last = page[page.length - 1];
    const nextCursor = data.length > limit && last ? btoa(JSON.stringify([last.spentAt, last.id])) : null;
    return c.json({ items: page, nextCursor }, 200);
  },
);

expenseRoutes.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/expenses",
    tags: ["expenses"],
    summary: "Add an expense (any split type, one or more payers)",
    description:
      "Shares are computed on the server with packages/core (largest-remainder rounding) and always add up to the amount. " +
      "Replaying the same `id` returns the original expense with status 200.",
    ...auth,
    request: { params: GroupParams, headers: IdempotencyHeader, ...body(ExpenseCreate) },
    responses: { 201: json(Expense, "Created"), 200: json(Expense, "Already existed (replayed id)"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { groupId } = c.req.valid("param");
    const b = c.req.valid("json");

    const members = await activeMembers(db, groupId, me);
    const active = new Set(members.filter((m) => m.removed_at === null).map((m) => m.id));
    const myMember = members.find((m) => m.user_id === me)!;

    const payers = b.payers ?? [{ memberId: myMember.id, amountPaise: b.amountPaise }];
    const unknown = [...payers.map((p) => p.memberId), ...splitMemberIds(b.split)].filter((id) => !active.has(id));
    if (unknown.length) {
      throw new ApiError(422, "UNKNOWN_MEMBER", "Some people in this expense aren't in the group.", { memberIds: [...new Set(unknown)] });
    }
    if (new Set(payers.map((p) => p.memberId)).size !== payers.length) {
      throw new ApiError(422, "DUPLICATE_MEMBER", "A payer is listed twice.");
    }

    const computed = computeExpense({
      total: b.amountPaise,
      payers: Object.fromEntries(payers.map((p) => [p.memberId, p.amountPaise])),
      split: toSplitSpec(b.split),
    });

    const res = await db.rpc("create_expense", {
      p_id: b.id,
      p_group_id: groupId,
      p_description: b.description,
      p_amount_paise: b.amountPaise,
      p_split_type: b.split.type,
      p_payers: rows(computed.payers),
      p_shares: rows(computed.shares),
      p_split_meta: b.split,
      p_category: b.category ?? null,
      p_spent_at: b.spentAt ?? new Date().toISOString(),
      p_notes: b.notes ?? null,
    });
    if (res.error) throw res.error.code === "42501" ? notFound("Group not found") : fromPg(res.error);
    const replayed = (res.data as { replayed?: boolean } | null)?.replayed === true;

    const row = must(await db.from("expenses").select(EXPENSE_SELECT).eq("id", b.id).single<ExpenseRow>());
    return replayed ? c.json(toExpense(row), 200) : c.json(toExpense(row), 201);
  },
);

expenseRoutes.openapi(
  createRoute({
    method: "get",
    path: "/expenses/{expenseId}",
    tags: ["expenses"],
    summary: "One expense with its payers and shares",
    ...auth,
    request: { params: ExpenseParams },
    responses: { 200: json(Expense, "Expense"), ...errors },
  }),
  async (c) => {
    const { expenseId } = c.req.valid("param");
    const { data, error } = await c.get("db").from("expenses").select(EXPENSE_SELECT).eq("id", expenseId).maybeSingle<ExpenseRow>();
    if (error) throw fromPg(error);
    if (!data) throw notFound("Expense not found");
    return c.json(toExpense(data), 200);
  },
);

expenseRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/expenses/{expenseId}",
    tags: ["expenses"],
    summary: "Delete an expense (soft delete; it can be restored)",
    ...auth,
    request: { params: ExpenseParams, headers: IdempotencyHeader },
    responses: { 200: json(z.object({ id: Uuid, deletedAt: z.string() }), "Deleted"), ...errors },
  }),
  async (c) => {
    const { expenseId } = c.req.valid("param");
    const db = c.get("db");
    const { data, error } = await db
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", expenseId)
      .is("deleted_at", null)
      .select("id, deleted_at")
      .maybeSingle<{ id: string; deleted_at: string }>();
    if (error) throw fromPg(error);
    if (data) return c.json({ id: data.id, deletedAt: data.deleted_at }, 200);
    // Already deleted? Deleting twice is fine.
    const { data: prior } = await db.from("expenses").select("id, deleted_at").eq("id", expenseId).maybeSingle<{ id: string; deleted_at: string | null }>();
    if (prior?.deleted_at) return c.json({ id: prior.id, deletedAt: prior.deleted_at }, 200);
    throw notFound("Expense not found");
  },
);

// ---------- balances ----------

expenseRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/balances",
    tags: ["balances"],
    summary: "Net balances and who pays whom",
    description:
      "Computed on the server with packages/core. With simplify (the group default), greedy minimum " +
      "cash flow gives at most n − 1 payments; without it, debts follow each expense's actual payers.",
    ...auth,
    request: {
      params: GroupParams,
      query: z.object({
        simplify: z.enum(["true", "false"]).optional().openapi({ description: "Defaults to the group's setting" }),
      }),
    },
    responses: { 200: json(Balances, "Balances"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { groupId } = c.req.valid("param");
    const q = c.req.valid("query");

    const members = await activeMembers(db, groupId, me);
    const [group, expenses, settlements] = await Promise.all([
      db.from("groups").select("simplify_debts").eq("id", groupId).single<{ simplify_debts: boolean }>(),
      db
        .from("expenses")
        .select("amount_paise, expense_payers(member_id, amount_paise), expense_shares(member_id, amount_paise)")
        .eq("group_id", groupId)
        .is("deleted_at", null)
        .returns<Pick<ExpenseRow, "amount_paise" | "expense_payers" | "expense_shares">[]>(),
      db
        .from("settlements")
        .select("from_member, to_member, amount_paise")
        .eq("group_id", groupId)
        .is("deleted_at", null)
        .returns<{ from_member: string; to_member: string; amount_paise: number }[]>(),
    ]);
    const simplify = q.simplify ? q.simplify === "true" : must(group).simplify_debts;
    const ledger: LedgerExpense[] = must(expenses).map((e) => ({
      payers: Object.fromEntries(e.expense_payers.map((p) => [p.member_id, Number(p.amount_paise)])),
      shares: Object.fromEntries(e.expense_shares.map((s) => [s.member_id, Number(s.amount_paise)])),
    }));
    const paid = must(settlements).map((s) => ({ from: s.from_member, to: s.to_member, amount: Number(s.amount_paise) }));

    const net = netBalances(ledger, paid, members.map((m) => m.id));
    const transfers = simplify ? simplifyDebts(net) : pairwiseDebts(ledger, paid);
    const myMember = members.find((m) => m.user_id === me)!;

    return c.json(
      {
        groupId,
        simplified: simplify,
        totalSpentPaise: must(expenses).reduce((s, e) => s + Number(e.amount_paise), 0),
        nets: Object.entries(net).map(([memberId, netPaise]) => ({ memberId, netPaise })),
        transfers: transfers.map((t) => ({ from: t.from, to: t.to, amountPaise: t.amount })),
        me: { memberId: myMember.id, netPaise: net[myMember.id] ?? 0 },
      },
      200,
    );
  },
);
