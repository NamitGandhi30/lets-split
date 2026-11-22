import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Balances, Expense, Group, Settlement } from "./client";
import { keys } from "./hooks";
import { applyToBalances, type LedgerChange } from "./ledger";

export type { LedgerChange };

/** Move the cached balances and trip totals for one write. Skipped (not guessed) if the maths objects. */
export function applyLedger(qc: QueryClient, groupId: string, c: LedgerChange) {
  try {
    qc.setQueryData<Balances>(keys.balances(groupId), (b) => (b ? applyToBalances(b, c) : b));
  } catch {
    /* the server's numbers arrive on the next sync */
  }
  if (c.kind !== "expense") return;
  const bump = (g: Group): Group => ({ ...g, totalSpentPaise: g.totalSpentPaise + c.sign * c.expense.amountPaise });
  qc.setQueryData<Group[]>(keys.groups, (list) => list?.map((g) => (g.id === groupId ? bump(g) : g)));
  qc.setQueryData<Group>(keys.group(groupId), (g) => (g ? bump(g) : g));
}

type Page = { items: Expense[]; nextCursor: string | null };
type ListData = Page | InfiniteData<Page>;

/** Edit every cached expense list for a trip: the recent list (one page) and the full list (paged). */
export function editExpenseLists(qc: QueryClient, groupId: string, edit: (items: Expense[]) => Expense[]) {
  qc.setQueriesData<ListData>({ queryKey: keys.expenses(groupId) }, (old) => {
    if (!old) return old;
    if ("pages" in old) {
      // New items go on the first page only; other pages just get removals and replacements.
      return { ...old, pages: old.pages.map((p, i) => ({ ...p, items: i === 0 ? edit(p.items) : edit(p.items).filter((e) => p.items.some((x) => x.id === e.id)) })) };
    }
    return "items" in old ? { ...old, items: edit(old.items) } : old;
  });
}

/** The cached copy of an expense, from its own screen or any list it appears in. */
export function findExpense(qc: QueryClient, groupId: string, expenseId: string): Expense | undefined {
  const own = qc.getQueryData<Expense>(keys.expense(expenseId));
  if (own) return own;
  for (const [, data] of qc.getQueriesData<ListData>({ queryKey: keys.expenses(groupId) })) {
    const pages = !data ? [] : "pages" in data ? data.pages : "items" in data ? [data] : [];
    for (const p of pages) {
      const hit = p.items.find((e) => e.id === expenseId);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Newest first, as the API lists them. */
export const bySpentAt = (a: Expense, b: Expense) => b.spentAt.localeCompare(a.spentAt) || b.createdAt.localeCompare(a.createdAt);

export function findSettlement(qc: QueryClient, groupId: string, settlementId: string): Settlement | undefined {
  return qc.getQueryData<Settlement[]>(keys.settlements(groupId))?.find((s) => s.id === settlementId);
}
