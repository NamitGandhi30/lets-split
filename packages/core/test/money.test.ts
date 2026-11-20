import { describe, expect, it } from "vitest";
import { allocate, formatINR, groupIndian, inrParts, MoneyError, paiseToRupeeString, splitEvenly, sum, toPaise } from "../src/index.ts";
import { rng } from "./rng.ts";

describe("toPaise", () => {
  it.each([
    ["4,280.50", 428050],
    ["₹ 1,350", 135000],
    ["99.9", 9990],
    ["0.005", 1],
    ["0.004", 0],
    [".5", 50],
    ["12.", 1200],
    ["-20.25", -2025],
    ["Rs. 1,00,000", 10000000],
  ])("parses %s", (input, want) => expect(toPaise(input)).toBe(want));

  it("parses numbers of rupees without float drift", () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1350.555)).toBe(135056);
    expect(toPaise(19.99)).toBe(1999);
  });

  it.each(["", "abc", "1.2.3", ".", "₹"])("rejects %j", (bad) => {
    expect(() => toPaise(bad)).toThrow(MoneyError);
  });
});

describe("allocate (largest remainder)", () => {
  it("splits ₹100 three ways with the extra paisa going first", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });

  it("gives leftover paise to the largest remainders, not the first index", () => {
    // quotas 2.5, 3.5, 4.0 -> floors 2, 3, 4 with one paisa left; the .5 tie goes to index 0
    expect(allocate(10, [25, 35, 40])).toEqual([3, 3, 4]);
    // quotas 1.2, 1.8 -> 1, 2
    expect(allocate(3, [2, 3])).toEqual([1, 2]);
  });

  it("handles fractional weights exactly", () => {
    expect(allocate(10000, [33.33, 33.33, 33.34])).toEqual([3333, 3333, 3334]);
    expect(allocate(100, [1.5, 1, 0.5])).toEqual([50, 33, 17]);
  });

  it("never gives paise to zero weights", () => {
    expect(allocate(101, [0, 1, 0, 1])).toEqual([0, 51, 0, 50]);
  });

  it("allocates negative totals symmetrically", () => {
    expect(allocate(-10000, [1, 1, 1])).toEqual([-3334, -3333, -3333]);
  });

  it("always adds up exactly (randomized)", () => {
    const r = rng(42);
    for (let t = 0; t < 2000; t++) {
      const n = 1 + r.int(12);
      const total = r.int(10_00_000_00);
      const weights: number[] = Array.from({ length: n }, () => (r.next() < 0.15 ? 0 : Math.round(r.next() * 10000) / 100));
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const parts = allocate(total, weights);
      expect(sum(parts)).toBe(total);
      const wsum = weights.reduce((a, b) => a + b, 0);
      parts.forEach((p, i) => {
        expect(Number.isInteger(p)).toBe(true);
        if (weights[i] === 0) expect(p).toBe(0);
        // each part is within one paisa of its exact quota
        expect(Math.abs(p - (total * weights[i]!) / wsum)).toBeLessThan(1.0001);
      });
    }
  });

  it("rejects bad input", () => {
    expect(() => allocate(100, [])).toThrow(MoneyError);
    expect(() => allocate(100, [0, 0])).toThrow(/zero/);
    expect(() => allocate(100, [1, -1])).toThrow(MoneyError);
    expect(() => allocate(1.5, [1])).toThrow(MoneyError);
  });

  it("splitEvenly differs by at most one paisa", () => {
    expect(splitEvenly(360000, 4)).toEqual([90000, 90000, 90000, 90000]);
    expect(splitEvenly(100, 7)).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });
});

describe("formatting", () => {
  it("groups digits the Indian way", () => {
    expect(groupIndian("1")).toBe("1");
    expect(groupIndian("1000")).toBe("1,000");
    expect(groupIndian("100000")).toBe("1,00,000");
    expect(groupIndian("12345678")).toBe("1,23,45,678");
  });

  it("splits parts for the big-whole / small-decimal display", () => {
    expect(inrParts(428050)).toEqual({ sign: "", whole: "4,280", decimal: ".50" });
    expect(inrParts(-5)).toEqual({ sign: "-", whole: "0", decimal: ".05" });
  });

  it("formats one-line amounts", () => {
    expect(formatINR(3842000)).toBe("₹38,420");
    expect(formatINR(428050)).toBe("₹4,280.50");
    expect(formatINR(-82000)).toBe("−₹820");
    expect(formatINR(135000, { plus: true })).toBe("+₹1,350");
    expect(formatINR(100, { decimals: "always", symbol: false })).toBe("1.00");
  });

  it("formats UPI amounts", () => {
    expect(paiseToRupeeString(135050)).toBe("1350.50");
    expect(paiseToRupeeString(5)).toBe("0.05");
  });
});
