import { assertPaise, MoneyError, type Paise } from "./money.ts";
import type { Allocation, MemberId } from "./split.ts";

export interface LedgerExpense {
  payers: Allocation;
  shares: Allocation;
}

/** A recorded payment: `from` paid `to` in real life. */
export interface LedgerSettlement {
  from: MemberId;
  to: MemberId;
  amount: Paise;
}

export interface Transfer {
  from: MemberId;
  to: MemberId;
  amount: Paise;
}

/**
 * Net balance per member: everything they paid (plus settlements they sent) minus everything
 * they owe (plus settlements they received). Positive means the group owes them.
 * Always adds up to zero. Members listed in `members` appear even when they're at zero.
 */
export function netBalances(
  expenses: readonly LedgerExpense[],
  settlements: readonly LedgerSettlement[] = [],
  members: readonly MemberId[] = [],
): Allocation {
  const net: Allocation = {};
  for (const m of members) net[m] = 0;
  const add = (k: MemberId, v: Paise) => (net[k] = (net[k] ?? 0) + v);
  for (const e of expenses) {
    for (const [k, v] of Object.entries(e.payers)) add(k, v);
    for (const [k, v] of Object.entries(e.shares)) add(k, -v);
  }
  for (const s of settlements) {
    assertPaise(s.amount, "settlement");
    if (s.amount <= 0) throw new MoneyError("INVALID_AMOUNT", "a settlement must be more than ₹0");
    if (s.from === s.to) throw new MoneyError("SELF_SETTLEMENT", "can't settle with yourself");
    add(s.from, s.amount);
    add(s.to, -s.amount);
  }
  let total = 0;
  for (const v of Object.values(net)) total += v;
  if (total !== 0) throw new MoneyError("UNBALANCED", `balances add up to ${total}, not zero`);
  return net;
}

/** Match debtors to creditors in order (north-west corner). Preserves every row and column total exactly. */
function matchInOrder(net: Allocation): Transfer[] {
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([k, v]) => ({ k, left: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([k, v]) => ({ k, left: v }));
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amt = Math.min(d.left, c.left);
    out.push({ from: d.k, to: c.k, amount: amt });
    d.left -= amt;
    c.left -= amt;
    if (d.left === 0) i++;
    if (c.left === 0) j++;
  }
  return out;
}

/**
 * Unsimplified "who owes whom": debts follow each expense's actual payers, then each pair of
 * people is netted against each other. Used when a group turns debt simplification off.
 */
export function pairwiseDebts(
  expenses: readonly LedgerExpense[],
  settlements: readonly LedgerSettlement[] = [],
): Transfer[] {
  const owe = new Map<string, number>();
  const key = (a: MemberId, b: MemberId) => JSON.stringify([a, b]);
  const addDebt = (from: MemberId, to: MemberId, amt: Paise) => {
    if (from === to || amt === 0) return;
    owe.set(key(from, to), (owe.get(key(from, to)) ?? 0) + amt);
  };
  for (const e of expenses) {
    const net = netBalances([e]);
    for (const t of matchInOrder(net)) addDebt(t.from, t.to, t.amount);
  }
  // A settlement from A to B pays down what A owes B (or creates a debt from B to A).
  for (const s of settlements) addDebt(s.to, s.from, s.amount);

  const out: Transfer[] = [];
  const seen = new Set<string>();
  for (const [k, amt] of owe) {
    const [a, b] = JSON.parse(k) as [MemberId, MemberId];
    const pair = [a, b].sort().join("\u0000");
    if (seen.has(pair)) continue;
    seen.add(pair);
    const diff = amt - (owe.get(key(b, a)) ?? 0);
    if (diff > 0) out.push({ from: a, to: b, amount: diff });
    else if (diff < 0) out.push({ from: b, to: a, amount: -diff });
  }
  return out;
}

/** Balance each member would have after the transfers are paid. Used to check simplification. */
export function applyTransfers(net: Allocation, transfers: readonly Transfer[]): Allocation {
  const out: Allocation = { ...net };
  for (const t of transfers) {
    out[t.from] = (out[t.from] ?? 0) + t.amount;
    out[t.to] = (out[t.to] ?? 0) - t.amount;
  }
  return out;
}

/** Net balances implied by a list of transfers (the reverse of simplification). */
export function netFromTransfers(transfers: readonly Transfer[]): Allocation {
  const out: Allocation = {};
  for (const t of transfers) {
    out[t.from] = (out[t.from] ?? 0) - t.amount;
    out[t.to] = (out[t.to] ?? 0) + t.amount;
  }
  return out;
}
