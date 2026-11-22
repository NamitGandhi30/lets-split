import { pairwiseDebts, simplifyDebts, type Allocation } from "@lets-split/core";
import type { Balances, Expense } from "./client";

/**
 * Apply a write to the cached balances on the phone, so "you owe / you're owed" moves the moment you
 * add an expense or settle up, even with no signal. The server's answer replaces it once it syncs.
 */
export type LedgerChange =
  | { kind: "expense"; sign: 1 | -1; expense: Pick<Expense, "amountPaise" | "payers" | "shares"> }
  | { kind: "settlement"; sign: 1 | -1; from: string; to: string; amountPaise: number };

const alloc = (rows: { memberId: string; amountPaise: number }[]): Allocation =>
  Object.fromEntries(rows.map((r) => [r.memberId, r.amountPaise]));

/** The same maths the API runs (packages/core), applied as a change to the last balances it sent. */
export function applyToBalances(b: Balances, c: LedgerChange): Balances {
  const net = new Map(b.nets.map((n) => [n.memberId, n.netPaise]));
  const add = (m: string, v: number) => net.set(m, (net.get(m) ?? 0) + v);

  // Unsimplified debts are each pair of people netted against each other, which adds up change by
  // change: keep one signed amount per pair (positive: the first id owes the second).
  const pairs = new Map<string, number>();
  const owe = (from: string, to: string, amount: number) => {
    if (from === to || amount === 0) return;
    const [a, z, s] = from < to ? [from, to, 1] : [to, from, -1];
    const k = `${a}\u0000${z}`;
    pairs.set(k, (pairs.get(k) ?? 0) + s * amount);
  };
  for (const t of b.transfers) owe(t.from, t.to, t.amountPaise);

  let spent = b.totalSpentPaise;
  if (c.kind === "expense") {
    const e = { payers: alloc(c.expense.payers), shares: alloc(c.expense.shares) };
    for (const [m, v] of Object.entries(e.payers)) add(m, c.sign * v);
    for (const [m, v] of Object.entries(e.shares)) add(m, -c.sign * v);
    if (!b.simplified) for (const t of pairwiseDebts([e])) owe(t.from, t.to, c.sign * t.amount);
    spent += c.sign * c.expense.amountPaise;
  } else {
    // `from` paid `to`: from's balance goes up, and it pays down what from owed to.
    add(c.from, c.sign * c.amountPaise);
    add(c.to, -c.sign * c.amountPaise);
    if (!b.simplified) owe(c.to, c.from, c.sign * c.amountPaise);
  }

  const transfers = b.simplified
    ? simplifyDebts(Object.fromEntries(net)).map((t) => ({ from: t.from, to: t.to, amountPaise: t.amount }))
    : [...pairs].flatMap(([k, v]) => {
        const [a, z] = k.split("\u0000") as [string, string];
        return v > 0 ? [{ from: a, to: z, amountPaise: v }] : v < 0 ? [{ from: z, to: a, amountPaise: -v }] : [];
      });

  const known = new Set(b.nets.map((n) => n.memberId));
  const nets = [
    ...b.nets.map((n) => ({ memberId: n.memberId, netPaise: net.get(n.memberId) ?? 0 })),
    ...[...net].filter(([m]) => !known.has(m)).map(([memberId, netPaise]) => ({ memberId, netPaise })),
  ];
  return {
    ...b,
    totalSpentPaise: spent,
    nets,
    transfers,
    me: b.me ? { memberId: b.me.memberId, netPaise: net.get(b.me.memberId) ?? 0 } : null,
  };
}
