import { assertPaise, type Paise } from "./money.ts";

/** Indian digit grouping: 1234567 -> "12,34,567". Pure, so it doesn't depend on the runtime's Intl data. */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(",")},${last3}`;
}

export interface InrParts {
  /** "-" for negative amounts, otherwise "". */
  sign: "-" | "";
  /** Grouped rupees, e.g. "4,280". */
  whole: string;
  /** Always two digits with the dot, e.g. ".50". The UI renders this smaller and lighter. */
  decimal: string;
}

/** Split an amount for display as ₹**4,280**.50. */
export function inrParts(p: Paise): InrParts {
  assertPaise(p);
  const a = Math.abs(p);
  return {
    sign: p < 0 ? "-" : "",
    whole: groupIndian(String(Math.floor(a / 100))),
    decimal: `.${String(a % 100).padStart(2, "0")}`,
  };
}

export interface FormatInrOptions {
  /** Prefix with ₹ (default true). */
  symbol?: boolean;
  /** "always" shows .00, "auto" (default) hides .00 but keeps .50, "never" drops paise. */
  decimals?: "always" | "auto" | "never";
  /** Show "+" on positive amounts (default false). */
  plus?: boolean;
}

/** One-line text form, e.g. "₹4,280.50", "−₹420", "+₹1,350". Uses a true minus sign. */
export function formatINR(p: Paise, opts: FormatInrOptions = {}): string {
  const { symbol = true, decimals = "auto", plus = false } = opts;
  const parts = inrParts(p);
  const dec =
    decimals === "never" ? "" : decimals === "auto" && parts.decimal === ".00" ? "" : parts.decimal;
  const sign = parts.sign ? "−" : plus && p > 0 ? "+" : "";
  return `${sign}${symbol ? "₹" : ""}${parts.whole}${dec}`;
}
