import { computeExpense, type SplitSpec } from "@lets-split/core";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { newId } from "../lib/uuid";
import { useToast } from "../ui/Toast";
import { api, ApiError, idem, unwrap, type Expense, type ExpenseCreate, type Schemas, type Settlement, type SplitInput } from "./client";
import { keys } from "./hooks";
import { applyLedger, bySpentAt, editExpenseLists, findExpense, findSettlement } from "./offline";

/**
 * Every write is a named mutation with defaults registered on the QueryClient, so a write made
 * offline is persisted, survives a reload, and resumes when the network comes back. Each one
 * carries `key`, made once per user action and sent as the Idempotency-Key on every retry, and
 * new records carry device-made ids, so a retry can never write twice.
 *
 * All writes share one queue and go to the server one at a time, in the order they were made, so
 * "add an expense, then edit it" made offline can't reach the server edit-first.
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
    currency: "INR", fx: b.fx ?? null, splitType: b.split.type, splitMeta: b.split, spentAt: b.spentAt ?? now, notes: b.notes ?? null,
    createdBy: me, createdAt: now, updatedAt: now, deletedAt: null,
    payers: Object.entries(c.payers).map(([memberId, amountPaise]) => ({ memberId, amountPaise })),
    shares: Object.entries(c.shares).map(([memberId, amountPaise]) => ({ memberId, amountPaise })),
  };
}

export function registerMutations(qc: QueryClient) {
  const def = <N extends Name>(
    name: N,
    o: { fn: (v: Vars[N]) => Promise<unknown>; settled?: (v: Vars[N], data: unknown) => void; creates?: boolean },
  ) =>
    qc.setMutationDefaults([name], {
      // A create is keyed by a device-made id. CONFLICT means an earlier attempt that timed out on our
      // side did land, so the write is done.
      mutationFn: (v: Vars[N]) =>
        o.creates ? o.fn(v).catch((e) => (e instanceof ApiError && e.code === "CONFLICT" ? null : Promise.reject(e))) : o.fn(v),
      onSettled: (data: unknown, _e: unknown, v: Vars[N]) => o.settled?.(v, data),
      // Writes the person waits on (joining, their profile) stay out of the queue so a stuck expense
      // can't hold them up, and give up sooner so their screen can say so.
      ...(ON_SCREEN.has(name) ? { retry: (n: number, e: unknown) => n < 3 && retryWrite(n, e) } : { scope: { id: "writes" }, retry: retryWrite }),
      retryDelay: (n: number) => Math.min(30_000, 1000 * 2 ** n),
    });

  def("createGroup", {
    fn: ({ key, ...body }) => unwrap(api.POST("/api/v1/groups", { body, ...idem(key) })),
    settled: () => qc.invalidateQueries({ queryKey: keys.groups }),
    creates: true,
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
    creates: true,
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
    creates: true,
  });
  def("addSettlement", {
    fn: ({ key, groupId, body }) =>
      unwrap(api.POST("/api/v1/groups/{groupId}/settlements", { params: { path: { groupId } }, body, ...idem(key) })),
    settled: (v) => groupScoped(qc, v.groupId),
    creates: true,
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

  // Optimistic touches so the app answers instantly, online or not: the expense lists, the balances
  // and the trip totals all move on the phone, and the server's numbers replace them once it syncs.
  const touch = <N extends Name>(name: N, onMutate: (v: Vars[N]) => Promise<void> | void) =>
    qc.setMutationDefaults([name], { ...qc.getMutationDefaults([name]), onMutate });

  // What a removed expense looked like, so Undo can put it back with no network.
  const removed = new Map<string, Expense>();
  const myIds = (groupId: string) => {
    const groups = qc.getQueryData<{ id: string; myMemberId: string | null }[]>(keys.groups);
    const me = qc.getQueryData<{ id: string }>(keys.me);
    const member = groups?.find((g) => g.id === groupId)?.myMemberId;
    return member && me ? { member, me: me.id } : null;
  };
  const preview = (groupId: string, body: ExpenseCreate) => {
    const ids = myIds(groupId);
    if (!ids) return null;
    try {
      return previewExpense(groupId, body, ids.member, ids.me);
    } catch {
      return null;
    }
  };
  const hold = (groupId: string, list: "expenses" | "settlements") =>
    Promise.all([qc.cancelQueries({ queryKey: keys[list](groupId) }), qc.cancelQueries({ queryKey: keys.balances(groupId) })]);

  touch("addExpense", async (v) => {
    const e = preview(v.groupId, v.body);
    if (!e || findExpense(qc, v.groupId, e.id)) return;
    await hold(v.groupId, "expenses");
    editExpenseLists(qc, v.groupId, (items) => [e, ...items].sort(bySpentAt));
    qc.setQueryData(keys.expense(e.id), e);
    applyLedger(qc, v.groupId, { kind: "expense", sign: 1, expense: e });
  });

  touch("updateExpense", async (v) => {
    const old = findExpense(qc, v.groupId, v.expenseId);
    const e = preview(v.groupId, { id: v.expenseId, ...v.body });
    if (!old || !e) return;
    const next: Expense = { ...e, createdBy: old.createdBy, createdAt: old.createdAt };
    await hold(v.groupId, "expenses");
    editExpenseLists(qc, v.groupId, (items) => items.map((x) => (x.id === next.id ? next : x)).sort(bySpentAt));
    qc.setQueryData(keys.expense(next.id), next);
    applyLedger(qc, v.groupId, { kind: "expense", sign: -1, expense: old });
    applyLedger(qc, v.groupId, { kind: "expense", sign: 1, expense: next });
  });

  touch("deleteExpense", async (v) => {
    const old = findExpense(qc, v.groupId, v.expenseId);
    await hold(v.groupId, "expenses");
    editExpenseLists(qc, v.groupId, (items) => items.filter((e) => e.id !== v.expenseId));
    if (!old || old.deletedAt) return;
    removed.set(old.id, old);
    qc.setQueryData<Expense>(keys.expense(old.id), (e) => (e ? { ...e, deletedAt: new Date().toISOString() } : e));
    applyLedger(qc, v.groupId, { kind: "expense", sign: -1, expense: old });
  });

  touch("restoreExpense", async (v) => {
    const old = removed.get(v.expenseId) ?? findExpense(qc, v.groupId, v.expenseId);
    if (!old || (!old.deletedAt && !removed.has(old.id))) return;
    removed.delete(old.id);
    const back: Expense = { ...old, deletedAt: null };
    await hold(v.groupId, "expenses");
    editExpenseLists(qc, v.groupId, (items) => (items.some((e) => e.id === back.id) ? items : [back, ...items].sort(bySpentAt)));
    qc.setQueryData(keys.expense(back.id), back);
    applyLedger(qc, v.groupId, { kind: "expense", sign: 1, expense: back });
  });

  touch("addSettlement", async (v) => {
    const b = v.body;
    if (findSettlement(qc, v.groupId, b.id)) return;
    await hold(v.groupId, "settlements");
    const s: Settlement = {
      id: b.id, groupId: v.groupId, fromMemberId: b.fromMemberId, toMemberId: b.toMemberId, amountPaise: b.amountPaise,
      method: b.method ?? "other", note: b.note ?? null, settledAt: new Date().toISOString(),
      createdBy: qc.getQueryData<{ id: string }>(keys.me)?.id ?? "", deletedAt: null,
    };
    qc.setQueryData<Settlement[]>(keys.settlements(v.groupId), (list) => (list ? [s, ...list] : list));
    applyLedger(qc, v.groupId, { kind: "settlement", sign: 1, from: s.fromMemberId, to: s.toMemberId, amountPaise: s.amountPaise });
  });

  touch("deleteSettlement", async (v) => {
    const s = findSettlement(qc, v.groupId, v.settlementId);
    if (!s) return;
    await hold(v.groupId, "settlements");
    qc.setQueryData<Settlement[]>(keys.settlements(v.groupId), (list) => list?.filter((x) => x.id !== s.id));
    applyLedger(qc, v.groupId, { kind: "settlement", sign: -1, from: s.fromMemberId, to: s.toMemberId, amountPaise: s.amountPaise });
  });

  touch("markSeen", () => {
    qc.setQueryData<{ items: { unread: boolean }[]; unreadCount: number }>(keys.activity, (old) =>
      old ? { ...old, unreadCount: 0, items: old.items.map((i) => ({ ...i, unread: false })) } : old,
    );
  });
}

/**
 * Keep retrying a write until it lands, unless the server turned it down. "No network", "too slow"
 * and server hiccups all retry (the phone can claim to be online on one bar of signal), and the
 * write stays saved on the phone the whole time. 401 retries too: the session renews in between.
 */
function retryWrite(n: number, e: unknown) {
  if (!(e instanceof ApiError)) return true;
  if (e.status >= 500 || e.status === 401 || e.status === 408 || e.status === 429) return n < 6;
  return false;
}

/**
 * After a restart, pick up every queued write: the ones that were waiting for a network, and the
 * ones that were mid-request when the app closed. They run one at a time, in the order they were made.
 */
export function resumeQueuedWrites(qc: QueryClient) {
  for (const m of qc.getMutationCache().getAll()) {
    if (m.state.status === "pending") void m.continue().catch(() => {});
  }
}

// Writes whose own screen shows what went wrong (the person is still looking at it).
const ON_SCREEN = new Set<string>(["join", "updateMe", "rotateInvite", "markSeen"]);
const FAILED: Partial<Record<Name, string>> = {
  createGroup: "Couldn't create the trip",
  updateGroup: "Couldn't update the trip",
  archiveGroup: "Couldn't archive the trip",
  addMember: "Couldn't add that person",
  removeMember: "Couldn't remove that person",
  addExpense: "Couldn't save the expense",
  updateExpense: "Couldn't save your changes",
  deleteExpense: "Couldn't delete the expense",
  restoreExpense: "Couldn't bring the expense back",
  addComment: "Couldn't post the comment",
  addSettlement: "Couldn't record the payment",
  deleteSettlement: "Couldn't undo the payment",
};

/**
 * A queued write can fail long after its screen has closed (or after a restart), so the message
 * comes from here rather than from the screen that made it.
 */
export function useWriteFailures() {
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(
    () =>
      qc.getMutationCache().subscribe((ev) => {
        if (ev.type !== "updated" || ev.action.type !== "error") return;
        const name = ev.mutation.options.mutationKey?.[0] as Name | undefined;
        if (!name || ON_SCREEN.has(name)) return;
        const why = ev.action.error instanceof Error ? ev.action.error.message : "";
        const what = FAILED[name] ?? "Couldn't sync a change";
        toast(why ? `${what}: ${why}` : what, undefined, 5000);
      }),
    [qc, toast],
  );
}

/** `const add = useWrite("addExpense"); add.mutate(vars)`. Pass `withKey` to fill in the Idempotency-Key. */
export function useWrite<N extends Name>(name: N) {
  return useMutation<unknown, Error, Vars[N]>({ mutationKey: [name] });
}

/** A fresh Idempotency-Key for one user action. */
export const withKey = <T extends object>(v: T): T & K => ({ key: newId(), ...v });
