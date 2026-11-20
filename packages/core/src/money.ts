/**
 * Money is always an integer number of paise (1 rupee = 100 paise).
 * Floats never hold money; they only appear as split weights or percentages.
 */
export type Paise = number;

export class MoneyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MoneyError";
    this.code = code;
  }
}

/** Largest amount we accept: ₹1,00,00,00,000 (one hundred crore). Keeps every product below 2^53. */
export const MAX_PAISE = 100_000_000_00;

export function isPaise(n: unknown): n is Paise {
  return typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= MAX_PAISE;
}

export function assertPaise(n: unknown, label = "amount"): asserts n is Paise {
  if (!isPaise(n)) throw new MoneyError("INVALID_AMOUNT", `${label} must be an integer number of paise, got ${String(n)}`);
}

/**
 * Parse a rupee amount typed by a person ("4,280.50", "₹ 1,350", "99.9") or given as a number of rupees.
 * Rounds to the nearest paisa (half away from zero).
 */
export function toPaise(input: string | number): Paise {
  let s: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new MoneyError("INVALID_AMOUNT", `not a finite number: ${input}`);
    s = input.toFixed(4);
  } else {
    s = input.replace(/[₹,\s]/g, "").replace(/^Rs\.?/i, "");
  }
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new MoneyError("INVALID_AMOUNT", `not an amount: "${String(input)}"`);
  const neg = m[1] === "-";
  const whole = m[2] === "" ? 0 : Number(m[2]);
  const frac = (m[3] ?? "").padEnd(3, "0");
  let p = whole * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) p += 1;
  const out = neg ? -p : p;
  assertPaise(out);
  return out === 0 ? 0 : out;
}

/** Rupees as a fixed two-decimal string, e.g. 135050 -> "1350.50". Used for UPI `am=`. */
export function paiseToRupeeString(p: Paise): string {
  assertPaise(p);
  const neg = p < 0;
  const a = Math.abs(p);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

const SCALE = 1_000_000n;

/** Turn non-negative weights (possibly fractional, like 33.33 or 1.5) into exact integers. */
function integerWeights(weights: readonly number[]): bigint[] {
  return weights.map((w, i) => {
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) {
      throw new MoneyError("INVALID_WEIGHT", `weight #${i} must be a finite number >= 0, got ${String(w)}`);
    }
    return BigInt(Math.round(w * Number(SCALE)));
  });
}

/**
 * Split `total` into parts proportional to `weights` so the parts add up to `total` exactly.
 *
 * Largest-remainder (Hamilton) method: everyone gets the floor of their exact quota, then the
 * leftover paise go one each to the largest fractional remainders. Ties go to the earlier index,
 * so the same input always gives the same output on every device and on the server.
 * Negative totals are allocated as the negation of the positive allocation.
 */
export function allocate(total: Paise, weights: readonly number[]): Paise[] {
  assertPaise(total, "total");
  if (weights.length === 0) throw new MoneyError("NO_PARTICIPANTS", "cannot allocate among zero weights");
  if (total < 0) return allocate(-total, weights).map((p) => (p === 0 ? 0 : -p));
  const w = integerWeights(weights);
  const sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new MoneyError("ZERO_WEIGHTS", "weights must not all be zero");
  const T = BigInt(total);
  const base: bigint[] = [];
  const rem: bigint[] = [];
  let given = 0n;
  for (const wi of w) {
    const q = T * wi;
    base.push(q / sum);
    rem.push(q % sum);
    given += q / sum;
  }
  let left = Number(T - given);
  const order = rem
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => (w[i] ?? 0n) > 0n)
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (let k = 0; left > 0; k++, left--) {
    const slot = order[k % order.length]!;
    base[slot.i]! += 1n;
  }
  return base.map(Number);
}

/** Equal split: `n` parts that differ by at most one paisa, earlier parts get the extra paise. */
export function splitEvenly(total: Paise, n: number): Paise[] {
  if (!Number.isInteger(n) || n < 1) throw new MoneyError("NO_PARTICIPANTS", "need at least one person");
  return allocate(total, Array.from({ length: n }, () => 1));
}

export function sum(values: Iterable<Paise>): Paise {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
