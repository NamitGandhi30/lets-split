import { describe, expect, it } from "vitest";
import { MoneyError, receiptMismatch, splitItemized, sum } from "../src/index.ts";
import { rng } from "./rng.ts";

describe("splitItemized", () => {
  it("splits dishes among claimants, then tax and service charge in proportion", () => {
    const r = splitItemized({
      items: [
        { id: "1", name: "Prawn curry", amount: 60000, claims: { you: 1, diya: 1 } },
        { id: "2", name: "Kingfisher x2", amount: 40000, claims: { kabir: 1 } },
        { id: "3", name: "Fish thali", amount: 20000, claims: { diya: 1 } },
      ],
      charges: [
        { label: "CGST 2.5%", amount: 3000 },
        { label: "SGST 2.5%", amount: 3000 },
        { label: "Service 10%", amount: 12000 },
      ],
    });
    // subtotals: you 300, diya 500, kabir 400 (of 1200); charges 180 shared 45/75/60
    expect(r.perMember).toEqual({
      you: { subtotal: 30000, charges: 4500, total: 34500 },
      diya: { subtotal: 50000, charges: 7500, total: 57500 },
      kabir: { subtotal: 40000, charges: 6000, total: 46000 },
    });
    expect(r.total).toBe(138000);
    expect(sum(Object.values(r.shares))).toBe(138000);
  });

  it("supports weighted claims and discounts", () => {
    const r = splitItemized({
      items: [{ id: "pizza", amount: 1000, claims: { a: 2, b: 1 } }],
      charges: [{ label: "Discount", amount: -100 }],
    });
    expect(r.shares).toEqual({ a: 600, b: 300 });
  });

  it("rounds without losing a paisa", () => {
    const r = splitItemized({
      items: [{ id: "x", amount: 1000, claims: { a: 1, b: 1, c: 1 } }],
      charges: [{ label: "GST 5%", amount: 50 }],
    });
    expect(r.shares).toEqual({ a: 351, b: 350, c: 349 });
    expect(sum(Object.values(r.shares))).toBe(1050);
  });

  it("refuses unclaimed dishes", () => {
    expect(() =>
      splitItemized({ items: [{ id: "1", name: "Lassi", amount: 100, claims: {} }] }),
    ).toThrow(/Lassi/);
  });

  it("refuses a discount bigger than the bill", () => {
    expect(() =>
      splitItemized({ items: [{ id: "1", amount: 100, claims: { a: 1 } }], charges: [{ label: "x", amount: -200 }] }),
    ).toThrow(MoneyError);
  });

  it("detects receipts that don't add up", () => {
    const input = { items: [{ id: "1", amount: 1000, claims: { a: 1 } }], charges: [{ label: "GST", amount: 50 }] };
    expect(receiptMismatch(input, 1050)).toBe(0);
    expect(receiptMismatch(input, 1100)).toBe(50);
  });

  it("always adds up exactly (randomized)", () => {
    const r = rng(99);
    const ids = ["a", "b", "c", "d", "e"];
    for (let t = 0; t < 500; t++) {
      const items = Array.from({ length: 1 + r.int(10) }, (_, i) => {
        const who = ids.filter(() => r.next() < 0.5);
        return { id: String(i), amount: 1 + r.int(500000), claims: Object.fromEntries((who.length ? who : ["a"]).map((k) => [k, 1])) };
      });
      const charges = [
        { label: "tax", amount: r.int(50000) },
        { label: "service", amount: r.int(50000) },
      ];
      const res = splitItemized({ items, charges });
      expect(sum(Object.values(res.shares))).toBe(res.total);
      expect(res.total).toBe(sum(items.map((i) => i.amount)) + charges[0]!.amount + charges[1]!.amount);
    }
  });
});
