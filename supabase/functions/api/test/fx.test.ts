import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseCreate } from "../src/schemas.ts";
import { invert } from "../src/routes/fx.ts";

describe("fx", () => {
  afterEach(() => vi.restoreAllMocks());

  it("inverts per-rupee rates into rupees per unit, ISO codes only", () => {
    const out = invert({ USD: 0.012, THB: 0.4, INR: 1, btc: 1e-7, ZZZ: 0 });
    expect(out.USD).toBeCloseTo(83.333333, 4);
    expect(out.THB).toBeCloseTo(2.5, 6);
    expect(out).not.toHaveProperty("INR");
    expect(out).not.toHaveProperty("btc");
    expect(out).not.toHaveProperty("ZZZ");
  });

  const base = {
    id: "33333333-3333-4333-8333-333333333333",
    description: "Snorkelling",
    amountPaise: 168240,
    split: { type: "equal" as const, members: ["33333333-3333-4333-8333-333333333334"] },
  };

  it("accepts an expense with foreign currency", () => {
    expect(ExpenseCreate.safeParse({ ...base, fx: { currency: "USD", amount: 20, rate: 84.12 } }).success).toBe(true);
  });

  it("rejects INR, lowercase codes and non-positive amounts in fx", () => {
    expect(ExpenseCreate.safeParse({ ...base, fx: { currency: "INR", amount: 20, rate: 1 } }).success).toBe(false);
    expect(ExpenseCreate.safeParse({ ...base, fx: { currency: "usd", amount: 20, rate: 84 } }).success).toBe(false);
    expect(ExpenseCreate.safeParse({ ...base, fx: { currency: "USD", amount: 0, rate: 84 } }).success).toBe(false);
  });
});
