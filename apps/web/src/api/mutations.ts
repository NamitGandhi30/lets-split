import { computeExpense, type SplitSpec } from "@lets-split/core";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { newId } from "../lib/uuid";
import { api, idem, unwrap, type Expense, type ExpenseCreate, type Schemas, type SplitInput } from "./client";
import { keys } from "./hooks";

/**
 * Every write is a named mutation with defaults registered on the QueryClient, so a write made
 * offline is persisted, survives a reload, and resumes when the network comes back. Each one
 * carries `key`, made once per user action and sent as the Idempotency-Key on every retry, and
 * new records carry device-made ids, so a retry can never write twice.
 */
type K = { key: string };
export type Vars = {
  createGroup: K & Schemas["GroupCreate"];
  updateGroup: K & { groupId: string; patch: Schemas["GroupPatch"] };
  archiveGroup: K & { groupId: string; archived: boolean };
  rotateInvite: K & { groupId: string };
  addMember: K & { groupId: string; displayName: string; avatarKey?: string };
  removeMember: K & { groupId: string; memberId: string };
  join: K & { code: string; claimMemberId?: string };
  addExpense: K & { groupId: string; body: ExpenseCreate };
  updateExpense: K & { groupId: string; expenseId: string; body: Schemas["ExpenseUpdate"] };
  deleteExpense: K & { groupId: string; expenseId: string };
  restoreExpense: K & { groupId: string; expenseId: string };
  addComment: K & { expenseId: string; id: string; body: string };
  addSettlement: K & { groupId: string; body: Schemas["SettlementCreate"] };
  deleteSettlement: K & { groupId: string; settlementId: string };
  updateMe: K & { patch: Schemas["MePatch"] };
  markSeen: K;
};
type Name = keyof Vars;

const groupScoped = (qc: QueryClient, groupId: string) => {
  qc.invalidateQueries({ queryKey: keys.group(groupId) });
  qc.invalidateQueries({ queryKey: keys.groups, exact: true });
  qc.invalidateQueries({ queryKey: keys.activity });
};

/** Core split spec for the offline preview (same maths the API runs). */
function specOf(s: SplitInput): SplitSpec {
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
      return { type: "adjustment", members: s.members, adjustments: Object.fromEntries(s.adjustments.map((a) => [a.memberId, a.amountPaise])) };
  }
}

/** What the new expense will look like, before the server confirms it. */
export function previewExpense(groupId: string, b: ExpenseCreate, myMemberId: string, me: string): Expense {
  const payers = b.payers ?? [{ memberId: myMemberId, amountPaise: b.amountPaise }];
  const c = computeExpense({
    total: b.amountPaise,
    payers: Object.fromEntries(payers.map((p) => [p.memberId, p.amountPaise])),
    split: specOf(b.split),
  });
  const now = new Date().toISOString();
  return {
    id: b.id, groupId, description: b.description, category: b.category ?? null, amountPaise: b.amountPaise,
    currency: "INR", splitType: b.split.type, splitMeta: b.split, spentAt: b.spentAt ?? now, notes: b.notes ?? null,
    createdBy: me, createdAt: now, updatedAt: now, deletedAt: null,
    payers: Object.entries(c.payers).map(([memberId, amountPaise]) => ({ memberId, amountPaise })),
    shares: Object.entries(c.shares).map(([memberId, amountPaise]) => ({ memberId, amountPaise })),
  };
}

type Page = { items: Expense[]; nextCursor: string | null };

export function registerMutations(qc: QueryClient) {
  const def = <N extends Name>(name: N, o: { fn: (v: Vars[N]) => Promise<unknown>; settled?: (v: Vars[N], data: unknown) => void }) =>
    qc.setMutationDefaults([name], {
      mutationFn: (v: Vars[N]) => o.fn(v),
      onSettled: (data: unknown, _e: unknown, v: Vars[N]) => o.settled?.(v, data),
      retry: (n: number, e: unknown) => n < 3 && !(e instanceof Error && "status" in e && (e as { status: number }).status < 500),
    });

  def("createGroup", {
    fn: ({ key, ...body }) => unwrap(api.POST("/api/v1/groups", { body, ...idem(key) })),
    settled: () => qc.invalidateQueries({ queryKey: keys.groups }),
  });
  def("updateGroup", {
    fn: ({ key, groupId, patch }) => unwrap(api.PATCH("/api/v1/groups/{groupId}", { params: { path: { groupId } }, body: patch, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
  });
  def("archiveGroup", {
    fn: ({ key, groupId, archived }) =>
      unwrap(api.POST("/api/v1/groups/{groupId}/archive", { params: { path: { groupId } }, body: { archived }, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
  });
  def("rotateInvite", {
    fn: ({ key, groupId }) => unwrap(api.POST("/api/v1/groups/{groupId}/invite", { params: { path: { groupId } }, ...idem(key) })),
    settled: (v) => qc.invalidateQueries({ queryKey: keys.group(v.groupId) }),
  });
  def("addMember", {
    fn: ({ key, groupId, displayName, avatarKey }) =>
      unwrap(api.POST("/api/v1/groups/{groupId}/members", { params: { path: { groupId } }, body: { displayName, avatarKey }, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
  });
  def("removeMember", {
    fn: ({ key, groupId, memberId }) =>
      unwrap(api.PATCH("/api/v1/groups/{groupId}/members/{memberId}", { params: { path: { groupId, memberId } }, body: { removed: true }, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
  });
  def("join", {
    fn: ({ key, code, claimMemberId }) =>
      unwrap(api.POST("/api/v1/invites/{code}/join", { params: { path: { code } }, body: claimMemberId ? { claimMemberId } : {}, ...idem(key) })),
    settled: () => {
      qc.invalidateQueries({ queryKey: keys.groups });
      qc.invalidateQueries({ queryKey: keys.activity });
    },
  });
  def("addExpense", {
    fn: ({ key, groupId, body }) =>
      unwrap(api.POST("/api/v1/groups/{groupId}/expenses", { params: { path: { groupId } }, body, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
  });
  def("updateExpense", {
    fn: ({ key, expenseId, body }) => unwrap(api.PUT("/api/v1/expenses/{expenseId}", { params: { path: { expenseId } }, body, ...idem(key) })),
    settled: (v) => {
      groupScoped(qc, v.groupId);
      qc.invalidateQueries({ queryKey: ["expense", v.expenseId] });
    },
  });
  def("deleteExpense", {
    fn: ({ key, expenseId }) => unwrap(api.DELETE("/api/v1/expenses/{expenseId}", { params: { path: { expenseId } }, ...idem(key) })),
    settled: (v) => {
      groupScoped(qc, v.groupId);
      qc.invalidateQueries({ queryKey: ["expense", v.expenseId] });
    },
  });
  def("restoreExpense", {
    fn: ({ key, expenseId }) => unwrap(api.POST("/api/v1/expenses/{expenseId}/restore", { params: { path: { expenseId } }, ...idem(key) })),
    settled: (v) => {
      groupScoped(qc, v.groupId);
      qc.invalidateQueries({ queryKey: ["expense", v.expenseId] });
    },
  });
  def("addComment", {
    fn: ({ key, expenseId, id, body }) =>
      unwrap(api.POST("/api/v1/expenses/{expenseId}/comments", { params: { path: { expenseId } }, body: { id, body }, ...idem(key) })),
    settled: (v) => qc.invalidateQueries({ queryKey: keys.comments(v.expenseId) }),
  });
  def("addSettlement", {
    fn: ({ key, groupId, body }) =>
      unwrap(api.POST("/api/v1/groups/{groupId}/settlements", { params: { path: { groupId } }, body, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
  });
  def("deleteSettlement", {
    fn: ({ key, settlementId }) => unwrap(api.DELETE("/api/v1/settlements/{settlementId}", { params: { path: { settlementId } }, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
  });
  def("updateMe", {
    fn: ({ key, patch }) => unwrap(api.PATCH("/api/v1/me", { body: patch, ...idem(key) })),
    settled: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
  def("markSeen", {
    fn: ({ key }) => unwrap(api.POST("/api/v1/activity/seen", idem(key))),
    settled: () => qc.invalidateQueries({ queryKey: keys.activity }),
  });

  // Optimistic touches so the app answers instantly, online or not.
  qc.setMutationDefaults(["addExpense"], {
    ...qc.getMutationDefaults(["addExpense"]),
    onMutate: async (v: Vars["addExpense"]) => {
      const groups = qc.getQueryData<{ id: string; myMemberId: string | null }[]>(keys.groups);
      const me = qc.getQueryData<{ id: string }>(keys.me);
      const mine = groups?.find((g) => g.id === v.groupId)?.myMemberId;
      if (!mine || !me) return;
      let preview: Expense;
      try {
        preview = previewExpense(v.groupId, v.body, mine, me.id);
      } catch {
        return;
      }
      await qc.cancelQueries({ queryKey: keys.expenses(v.groupId) });
      qc.setQueriesData<Page>({ queryKey: keys.expenses(v.groupId) }, (old) =>
        old && "items" in old && !old.items.some((e) => e.id === preview.id) ? { ...old, items: [preview, ...old.items] } : old,
      );
    },
  });
  qc.setMutationDefaults(["deleteExpense"], {
    ...qc.getMutationDefaults(["deleteExpense"]),
    onMutate: async (v: Vars["deleteExpense"]) => {
      await qc.cancelQueries({ queryKey: keys.expenses(v.groupId) });
      qc.setQueriesData<Page>({ queryKey: keys.expenses(v.groupId) }, (old) =>
        old && "items" in old ? { ...old, items: old.items.filter((e) => e.id !== v.expenseId) } : old,
      );
    },
  });
  qc.setMutationDefaults(["markSeen"], {
    ...qc.getMutationDefaults(["markSeen"]),
    onMutate: () => {
      qc.setQueryData<{ items: { unread: boolean }[]; unreadCount: number }>(keys.activity, (old) =>
        old ? { ...old, unreadCount: 0, items: old.items.map((i) => ({ ...i, unread: false })) } : old,
      );
    },
  });
}

/** `const add = useWrite("addExpense"); add.mutate(vars)`. Pass `withKey` to fill in the Idempotency-Key. */
export function useWrite<N extends Name>(name: N) {
  return useMutation<unknown, Error, Vars[N]>({ mutationKey: [name] });
}

/** A fresh Idempotency-Key for one user action. */
export const withKey = <T extends object>(v: T): T & K => ({ key: newId(), ...v });
