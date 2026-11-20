import { describe, expect, it } from "vitest";
import {
  applyTransfers,
  computeExpense,
  MoneyError,
  netBalances,
  netFromTransfers,
  pairwiseDebts,
  simplifyDebts,
  sum,
  type Allocation,
  type LedgerExpense,
} from "../src/index.ts";
import { rng } from "./rng.ts";

const allZero = (a: Allocation) => Object.values(a).every((v) => v === 0);
const strip = (a: Allocation) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== 0));

const goa: LedgerExpense[] = [
  computeExpense({ total: 2100000, payers: { meera: 2100000 }, split: { type: "equal", members: ["you", "diya", "kabir", "meera", "rohan", "aanya"] } }),
  computeExpense({ total: 280000, payers: { you: 280000 }, split: { type: "equal", members: ["you", "diya", "kabir", "meera"] } }),
  computeExpense({ total: 465000, payers: { kabir: 465000 }, split: { type: "equal", members: ["you", "diya", "kabir", "meera", "rohan", "aanya"] } }),
  computeExpense({ total: 318000, payers: { diya: 200000, you: 118000 }, split: { type: "shares", shares: { you: 1, diya: 2, rohan: 1, aanya: 2 } } }),
];

describe("netBalances", () => {
  it("adds up to zero and reflects payers minus shares", () => {
    const net = netBalances(goa);
    expect(sum(Object.values(net))).toBe(0);
    // Meera paid ₹21,000 and owes ₹3,500 + ₹700 + ₹775
    expect(net.meera).toBe(2100000 - 350000 - 70000 - 77500);
  });

  it("settlements move balances toward zero", () => {
    const net = netBalances(
      [computeExpense({ total: 1000, payers: { a: 1000 }, split: { type: "equal", members: ["a", "b"] } })],
      [{ from: "b", to: "a", amount: 500 }],
      ["a", "b", "c"],
    );
    expect(net).toEqual({ a: 0, b: 0, c: 0 });
  });

  it("rejects bad settlements", () => {
    expect(() => netBalances([], [{ from: "a", to: "a", amount: 1 }])).toThrow(MoneyError);
    expect(() => netBalances([], [{ from: "a", to: "b", amount: 0 }])).toThrow(MoneyError);
  });
});

describe("simplifyDebts (greedy min cash flow)", () => {
  it("settles a simple chain in one payment", () => {
    // a owes b ₹10, b owes c ₹10 -> a pays c ₹10
    expect(simplifyDebts({ a: -1000, b: 0, c: 1000 })).toEqual([{ from: "a", to: "c", amount: 1000 }]);
  });

  it("biggest debtor pays biggest creditor first", () => {
    expect(simplifyDebts({ a: -500, b: -300, c: 600, d: 200 })).toEqual([
      { from: "a", to: "c", amount: 500 },
      { from: "b", to: "d", amount: 200 },
      { from: "b", to: "c", amount: 100 },
    ]);
  });

  it("returns nothing when everyone is square", () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
    expect(simplifyDebts({})).toEqual([]);
  });

  it("rejects balances that don't add up to zero", () => {
    expect(() => simplifyDebts({ a: 1, b: 0 })).toThrow(/zero/);
  });

  it("preserves every net balance with at most n − 1 transfers (randomized)", () => {
    const r = rng(2026);
    const ids = ["you", "diya", "kabir", "meera", "rohan", "aanya", "dev", "isha", "p9", "p10", "p11", "p12"];
    for (let t = 0; t < 1000; t++) {
      const people = ids.slice(0, 2 + r.int(ids.length - 1));
      const expenses: LedgerExpense[] = Array.from({ length: 1 + r.int(25) }, () => {
        const total = 1 + r.int(50_000_00);
        const members = people.filter(() => r.next() < 0.7);
        const payer = r.pick(people);
        return computeExpense({ total, payers: { [payer]: total }, split: { type: "equal", members: members.length ? members : [payer] } });
      });
      const net = netBalances(expenses);
      const plan = simplifyDebts(net);
      const nonZero = Object.values(net).filter((v) => v !== 0).length;

      expect(allZero(applyTransfers(net, plan))).toBe(true);
      expect(strip(netFromTransfers(plan))).toEqual(strip(net));
      expect(plan.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      for (const tr of plan) {
        expect(tr.amount).toBeGreaterThan(0);
        expect(Number.isInteger(tr.amount)).toBe(true);
        expect(tr.from).not.toBe(tr.to);
      }
    }
  });

  it("is deterministic regardless of key order", () => {
    const a = simplifyDebts({ x: -100, y: -100, z: 200 });
    const b = simplifyDebts({ z: 200, y: -100, x: -100 });
    expect(a).toEqual(b);
  });
});

describe("pairwiseDebts (simplify off)", () => {
  it("follows actual payers and nets each pair", () => {
    const ex = [
      computeExpense({ total: 1000, payers: { a: 1000 }, split: { type: "equal", members: ["a", "b"] } }),
      computeExpense({ total: 400, payers: { b: 400 }, split: { type: "equal", members: ["a", "b"] } }),
      computeExpense({ total: 600, payers: { c: 600 }, split: { type: "equal", members: ["b", "c"] } }),
    ];
    expect(pairwiseDebts(ex)).toEqual([
      { from: "b", to: "a", amount: 300 },
      { from: "b", to: "c", amount: 300 },
    ]);
  });

  it("matches net balances (randomized, multiple payers and settlements)", () => {
    const r = rng(5);
    const people = ["a", "b", "c", "d", "e"];
    for (let t = 0; t < 300; t++) {
      const expenses = Array.from({ length: 1 + r.int(10) }, () => {
        const total = 2 + r.int(100000);
        const p1 = r.pick(people);
        const p2 = r.pick(people.filter((p) => p !== p1));
        const cut = 1 + r.int(total - 1);
        return computeExpense({ total, payers: { [p1]: cut, [p2]: total - cut }, split: { type: "shares", shares: { a: 1, b: 2, c: 1, d: r.int(3), e: 1 } } });
      });
      const settlements = [{ from: "b", to: "a", amount: 1 + r.int(5000) }];
      const pw = pairwiseDebts(expenses, settlements);
      expect(strip(netFromTransfers(pw))).toEqual(strip(netBalances(expenses, settlements)));
    }
  });
});
