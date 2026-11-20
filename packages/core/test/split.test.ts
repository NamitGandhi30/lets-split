import { describe, expect, it } from "vitest";
import { computeExpense, computeShares, MoneyError, sum, validatePayers, type SplitSpec } from "../src/index.ts";
import { rng } from "./rng.ts";

const total = (a: Record<string, number>) => sum(Object.values(a));

describe("computeShares", () => {
  it("equal: ₹3,600 four ways", () => {
    expect(computeShares(360000, { type: "equal", members: ["you", "diya", "kabir", "meera"] })).toEqual({
      you: 90000, diya: 90000, kabir: 90000, meera: 90000,
    });
  });

  it("equal: ₹100 three ways puts the extra paisa on the first person", () => {
    expect(computeShares(10000, { type: "equal", members: ["a", "b", "c"] })).toEqual({ a: 3334, b: 3333, c: 3333 });
  });

  it("exact: must add up to the total", () => {
    expect(computeShares(1000, { type: "exact", amounts: { a: 600, b: 400, c: 0 } })).toEqual({ a: 600, b: 400 });
    expect(() => computeShares(1000, { type: "exact", amounts: { a: 600, b: 300 } })).toThrow(/add up/);
    expect(() => computeShares(1000, { type: "exact", amounts: { a: 1100, b: -100 } })).toThrow(MoneyError);
  });

  it("percent: allows decimals and must reach 100%", () => {
    expect(computeShares(10000, { type: "percent", percents: { a: 33.33, b: 33.33, c: 33.34 } })).toEqual({
      a: 3333, b: 3333, c: 3334,
    });
    expect(computeShares(99999, { type: "percent", percents: { a: 50, b: 50 } })).toEqual({ a: 50000, b: 49999 });
    expect(() => computeShares(1000, { type: "percent", percents: { a: 50, b: 49 } })).toThrow(/99%/);
  });

  it("shares: weights like a couple counting double", () => {
    expect(computeShares(90000, { type: "shares", shares: { couple: 2, solo: 1 } })).toEqual({ couple: 60000, solo: 30000 });
    expect(computeShares(1000, { type: "shares", shares: { a: 1.5, b: 1, c: 0 } })).toEqual({ a: 600, b: 400 });
    expect(() => computeShares(1000, { type: "shares", shares: { a: 0 } })).toThrow(MoneyError);
  });

  it("adjustment: extras on top, rest split equally", () => {
    // ₹1,000 with Kabir +₹100 (extra drink) and Diya −₹40: ₹940 left, ₹313.34/313.33/313.33
    const r = computeShares(100000, {
      type: "adjustment",
      members: ["kabir", "diya", "you"],
      adjustments: { kabir: 10000, diya: -4000 },
    });
    expect(r).toEqual({ kabir: 41334, diya: 27333, you: 31333 });
    expect(total(r)).toBe(100000);
  });

  it("adjustment: rejects impossible adjustments", () => {
    expect(() =>
      computeShares(1000, { type: "adjustment", members: ["a", "b"], adjustments: { a: 2000 } }),
    ).toThrow(/bigger/);
    expect(() =>
      computeShares(1000, { type: "adjustment", members: ["a", "b"], adjustments: { a: -1100 } }),
    ).toThrow(/negative/);
    expect(() =>
      computeShares(1000, { type: "adjustment", members: ["a"], adjustments: { z: 10 } }),
    ).toThrow(/not in the split/);
  });

  it("rejects empty, duplicate and zero cases", () => {
    expect(() => computeShares(1000, { type: "equal", members: [] })).toThrow(MoneyError);
    expect(() => computeShares(1000, { type: "equal", members: ["a", "a"] })).toThrow(/twice/);
    expect(() => computeShares(0, { type: "equal", members: ["a"] })).toThrow(MoneyError);
    expect(() => computeShares(10.5, { type: "equal", members: ["a"] })).toThrow(MoneyError);
  });

  it("every split type always adds up exactly (randomized)", () => {
    const r = rng(7);
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    for (let t = 0; t < 1500; t++) {
      const amount = 1 + r.int(5_00_000_00);
      const people = ids.slice(0, 1 + r.int(ids.length));
      const type = r.pick(["equal", "percent", "shares", "adjustment", "exact"] as const);
      let spec: SplitSpec;
      if (type === "equal") spec = { type, members: people };
      else if (type === "shares") spec = { type, shares: Object.fromEntries(people.map((p) => [p, 0.5 + r.int(6)])) };
      else if (type === "percent") {
        const bp = Array.from({ length: people.length }, () => 1 + r.int(100));
        const s = bp.reduce((x, y) => x + y, 0);
        const scaled = bp.map((b) => Math.floor((b * 10000) / s));
        scaled[0]! += 10000 - scaled.reduce((x, y) => x + y, 0);
        spec = { type, percents: Object.fromEntries(people.map((p, i) => [p, scaled[i]! / 100])) };
      } else if (type === "adjustment") {
        const cap = Math.floor(amount / (2 * people.length));
        spec = { type, members: people, adjustments: Object.fromEntries(people.map((p) => [p, r.int(cap + 1)])) };
      } else {
        const parts = people.map(() => r.int(amount));
        const s = parts.reduce((x, y) => x + y, 0) || 1;
        const exact = parts.map((p) => Math.floor((p * amount) / s));
        exact[0]! += amount - exact.reduce((x, y) => x + y, 0);
        spec = { type, amounts: Object.fromEntries(people.map((p, i) => [p, exact[i]!])) };
      }
      const shares = computeShares(amount, spec);
      expect(total(shares)).toBe(amount);
      for (const v of Object.values(shares)) expect(Number.isInteger(v) && v > 0).toBe(true);
    }
  });
});

describe("payers", () => {
  it("supports multiple payers (I paid ₹2,000, Rahul paid ₹1,000)", () => {
    const e = computeExpense({
      total: 300000,
      payers: { you: 200000, rahul: 100000 },
      split: { type: "equal", members: ["you", "rahul", "diya"] },
    });
    expect(e.shares).toEqual({ you: 100000, rahul: 100000, diya: 100000 });
    expect(e.net).toEqual({ you: 100000, rahul: 0, diya: -100000 });
    expect(total(e.net)).toBe(0);
  });

  it("a payer who isn't in the split is owed the whole amount", () => {
    const e = computeExpense({ total: 5000, payers: { mom: 5000 }, split: { type: "equal", members: ["a", "b"] } });
    expect(e.net).toEqual({ mom: 5000, a: -2500, b: -2500 });
  });

  it("payers must add up and be positive", () => {
    expect(() => validatePayers(1000, { a: 600 })).toThrow(/add up/);
    expect(() => validatePayers(1000, { a: 1000, b: 0 })).toThrow(MoneyError);
    expect(() => validatePayers(1000, {})).toThrow(/pay/);
  });
});
