import { MoneyError } from "./money.ts";
import type { Transfer } from "./balances.ts";
import type { Allocation, MemberId } from "./split.ts";

/**
 * Greedy minimum cash flow: repeatedly have the biggest debtor pay the biggest creditor as
 * much as they can. Every step settles at least one person and the last step settles two,
 * so n people with non-zero balances need at most n − 1 transfers. Every net balance is
 * preserved exactly. Ties are broken by member id, so all devices agree on the plan.
 */
export function simplifyDebts(net: Allocation): Transfer[] {
  let total = 0;
  for (const v of Object.values(net)) {
    if (!Number.isSafeInteger(v)) throw new MoneyError("INVALID_AMOUNT", `balance must be integer paise, got ${v}`);
    total += v;
  }
  if (total !== 0) throw new MoneyError("UNBALANCED", `balances add up to ${total}, not zero`);

  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([k, v]) => ({ k, left: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([k, v]) => ({ k, left: v }));
  const biggest = (xs: { k: MemberId; left: number }[]) => {
    let best: { k: MemberId; left: number } | undefined;
    for (const x of xs) {
      if (x.left === 0) continue;
      if (!best || x.left > best.left || (x.left === best.left && x.k < best.k)) best = x;
    }
    return best;
  };

  const out: Transfer[] = [];
  for (;;) {
    const d = biggest(debtors);
    const c = biggest(creditors);
    if (!d || !c) break;
    const amount = Math.min(d.left, c.left);
    out.push({ from: d.k, to: c.k, amount });
    d.left -= amount;
    c.left -= amount;
  }
  return out;
}
