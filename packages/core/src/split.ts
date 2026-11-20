import { allocate, assertPaise, MoneyError, splitEvenly, sum, type Paise } from "./money.ts";

export type MemberId = string;

/** Amount per member. Key order is meaningful: it breaks rounding ties. */
export type Allocation = Record<MemberId, Paise>;

export type SplitSpec =
  /** Everyone listed pays the same; leftover paise go to the earliest members. */
  | { type: "equal"; members: MemberId[] }
  /** Exact amounts that must add up to the total. */
  | { type: "exact"; amounts: Record<MemberId, Paise> }
  /** Percentages that must add up to 100 (decimals allowed, e.g. 33.33). */
  | { type: "percent"; percents: Record<MemberId, number> }
  /** Weights, e.g. a couple counts as 2 shares. */
  | { type: "shares"; shares: Record<MemberId, number> }
  /**
   * Equal split among `members`, then each member's adjustment is added on top
   * (positive: pays more, negative: pays less). The rest is spread equally.
   */
  | { type: "adjustment"; members: MemberId[]; adjustments: Record<MemberId, Paise> };

export type SplitType = SplitSpec["type"];
export const SPLIT_TYPES: readonly SplitType[] = ["equal", "exact", "percent", "shares", "adjustment"];

function uniqueMembers(members: readonly MemberId[]): MemberId[] {
  if (members.length === 0) throw new MoneyError("NO_PARTICIPANTS", "pick at least one person");
  if (new Set(members).size !== members.length) throw new MoneyError("DUPLICATE_MEMBER", "a person is listed twice");
  return [...members];
}

function dropZeros(a: Allocation): Allocation {
  const out: Allocation = {};
  for (const [k, v] of Object.entries(a)) if (v !== 0) out[k] = v;
  return out;
}

function zip(keys: readonly MemberId[], values: readonly Paise[]): Allocation {
  const out: Allocation = {};
  keys.forEach((k, i) => (out[k] = values[i]!));
  return out;
}

/** Who owes how much of `total`. The result always adds up to `total` exactly; zero shares are omitted. */
export function computeShares(total: Paise, spec: SplitSpec): Allocation {
  assertPaise(total, "total");
  if (total <= 0) throw new MoneyError("INVALID_AMOUNT", "an expense must be more than ₹0");

  switch (spec.type) {
    case "equal": {
      const m = uniqueMembers(spec.members);
      return dropZeros(zip(m, splitEvenly(total, m.length)));
    }
    case "exact": {
      const keys = Object.keys(spec.amounts);
      if (keys.length === 0) throw new MoneyError("NO_PARTICIPANTS", "pick at least one person");
      for (const k of keys) {
        const v = spec.amounts[k];
        assertPaise(v, `amount for ${k}`);
        if (v < 0) throw new MoneyError("NEGATIVE_SHARE", "amounts can't be negative");
      }
      const s = sum(Object.values(spec.amounts));
      if (s !== total) {
        throw new MoneyError("SPLIT_MISMATCH", `amounts add up to ${s} paise but the expense is ${total}`);
      }
      return dropZeros({ ...spec.amounts });
    }
    case "percent": {
      const keys = Object.keys(spec.percents);
      if (keys.length === 0) throw new MoneyError("NO_PARTICIPANTS", "pick at least one person");
      const pct = keys.map((k) => spec.percents[k]!);
      // Compare in hundredths of a percent so 33.33 + 33.33 + 33.34 is exactly 100.
      const bp = pct.reduce((a, p) => a + Math.round(p * 100), 0);
      if (bp !== 10_000) throw new MoneyError("SPLIT_MISMATCH", `percentages add up to ${bp / 100}%, not 100%`);
      return dropZeros(zip(keys, allocate(total, pct)));
    }
    case "shares": {
      const keys = Object.keys(spec.shares);
      if (keys.length === 0) throw new MoneyError("NO_PARTICIPANTS", "pick at least one person");
      return dropZeros(zip(keys, allocate(total, keys.map((k) => spec.shares[k]!))));
    }
    case "adjustment": {
      const m = uniqueMembers(spec.members);
      const adj = m.map((k) => {
        const v = spec.adjustments[k] ?? 0;
        assertPaise(v, `adjustment for ${k}`);
        return v;
      });
      for (const k of Object.keys(spec.adjustments)) {
        if (!m.includes(k)) throw new MoneyError("UNKNOWN_MEMBER", `adjustment for someone not in the split: ${k}`);
      }
      const rest = total - sum(adj);
      if (rest < 0) throw new MoneyError("SPLIT_MISMATCH", "adjustments are bigger than the expense");
      const even = splitEvenly(rest, m.length);
      const shares = even.map((e, i) => e + adj[i]!);
      if (shares.some((s) => s < 0)) throw new MoneyError("NEGATIVE_SHARE", "an adjustment makes someone's share negative");
      return dropZeros(zip(m, shares));
    }
    default: {
      const never: never = spec;
      throw new MoneyError("UNKNOWN_SPLIT", `unknown split type ${(never as { type: string }).type}`);
    }
  }
}

/** Payers must be positive integer amounts that add up to the total. Multiple payers are fine. */
export function validatePayers(total: Paise, payers: Allocation): Allocation {
  const keys = Object.keys(payers);
  if (keys.length === 0) throw new MoneyError("NO_PAYER", "someone has to pay");
  for (const k of keys) {
    const v = payers[k];
    assertPaise(v, `payment by ${k}`);
    if (v <= 0) throw new MoneyError("INVALID_AMOUNT", "each payer must pay more than ₹0");
  }
  const s = sum(Object.values(payers));
  if (s !== total) throw new MoneyError("PAYER_MISMATCH", `payers add up to ${s} paise but the expense is ${total}`);
  return { ...payers };
}

export interface ExpenseInput {
  total: Paise;
  payers: Allocation;
  split: SplitSpec;
}

export interface ComputedExpense {
  total: Paise;
  payers: Allocation;
  shares: Allocation;
  /** paid − owed for everyone involved; adds up to zero. Positive means they are owed money. */
  net: Allocation;
}

/** Validate and resolve one expense into exact payer and share rows. */
export function computeExpense(input: ExpenseInput): ComputedExpense {
  const payers = validatePayers(input.total, input.payers);
  const shares = computeShares(input.total, input.split);
  const net: Allocation = {};
  for (const [k, v] of Object.entries(payers)) net[k] = (net[k] ?? 0) + v;
  for (const [k, v] of Object.entries(shares)) net[k] = (net[k] ?? 0) - v;
  return { total: input.total, payers, shares, net };
}
