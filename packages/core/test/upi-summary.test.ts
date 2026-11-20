import { describe, expect, it } from "vitest";
import { buildUpiAppLinks, buildUpiLink, isValidVpa, MoneyError, whatsappSummary } from "../src/index.ts";

describe("UPI links", () => {
  it("builds a standard upi://pay link", () => {
    expect(buildUpiLink({ vpa: "Diya@okaxis", name: "Diya Shah", amount: 135050, note: "Goa '26 · Let's Split" })).toBe(
      "upi://pay?pa=diya@okaxis&pn=Diya%20Shah&am=1350.50&cu=INR&tn=Goa%20%2726%20%C2%B7%20Let%27s%20Split",
    );
  });

  it("leaves the amount out when not given and keeps the @ readable", () => {
    expect(buildUpiLink({ vpa: "kabir.k@ybl" })).toBe("upi://pay?pa=kabir.k@ybl&cu=INR");
  });

  it("encodes reserved characters in names and notes", () => {
    const link = buildUpiLink({ vpa: "a@ybl", name: "R&D = fun?", note: "50% off #1" });
    expect(link).toContain("pn=R%26D%20%3D%20fun%3F");
    expect(link).toContain("tn=50%25%20off%20%231");
  });

  it("trims long notes to 50 characters", () => {
    const tn = /tn=([^&]*)/.exec(buildUpiLink({ vpa: "a@ybl", note: "x".repeat(80) }))?.[1];
    expect(tn).toHaveLength(50);
  });

  it("gives each iOS app its own scheme with the same query", () => {
    const l = buildUpiAppLinks({ vpa: "meera@paytm", amount: 42000 });
    expect(l.upi).toBe("upi://pay?pa=meera@paytm&am=420.00&cu=INR");
    expect(l.gpay).toBe("gpay://upi/pay?pa=meera@paytm&am=420.00&cu=INR");
    expect(l.phonepe).toBe("phonepe://pay?pa=meera@paytm&am=420.00&cu=INR");
    expect(l.paytm).toBe("paytmmp://pay?pa=meera@paytm&am=420.00&cu=INR");
  });

  it("validates UPI IDs and amounts", () => {
    expect(isValidVpa("9876543210@upi")).toBe(true);
    expect(isValidVpa("name.surname-1@okhdfcbank")).toBe(true);
    expect(isValidVpa("no-at-sign")).toBe(false);
    expect(isValidVpa("a b@ybl")).toBe(false);
    expect(isValidVpa("x@1bank")).toBe(false);
    expect(() => buildUpiLink({ vpa: "bad" })).toThrow(MoneyError);
    expect(() => buildUpiLink({ vpa: "a@ybl", amount: 0 })).toThrow(MoneyError);
    expect(() => buildUpiLink({ vpa: "a@ybl", amount: 10.5 })).toThrow(MoneyError);
  });
});

describe("whatsappSummary", () => {
  const names = { you: "You", diya: "Diya", kabir: "Kabir", meera: "Meera" };

  it("lists the settle-up plan, UPI IDs and nets", () => {
    const text = whatsappSummary({
      groupName: "Goa '26",
      names,
      totalSpent: 3842000,
      nets: { you: 428050, diya: -135000, kabir: -42050, meera: -251000 },
      transfers: [
        { from: "meera", to: "you", amount: 251000 },
        { from: "diya", to: "you", amount: 135000 },
        { from: "kabir", to: "you", amount: 42050 },
      ],
      upiIds: { you: "namit@okicici" },
    });
    expect(text).toBe(
      [
        "*Goa '26* · balances",
        "Total spent: ₹38,420",
        "",
        "*To settle up* (3 payments)",
        "• Meera → You: ₹2,510",
        "• Diya → You: ₹1,350",
        "• Kabir → You: ₹420.50",
        "",
        "*UPI*",
        "You: namit@okicici",
        "",
        "*Net*",
        "You: gets back ₹4,280.50",
        "Kabir: owes ₹420.50",
        "Diya: owes ₹1,350",
        "Meera: owes ₹2,510",
        "",
        "_Sent from Let's Split_",
      ].join("\n"),
    );
  });

  it("says when everyone is square", () => {
    const text = whatsappSummary({ groupName: "Jaipur", names, nets: { you: 0, diya: 0 }, transfers: [] });
    expect(text).toContain("Everyone is settled up");
    expect(text).not.toContain("*Net*");
  });

  it("uses the singular for one payment", () => {
    const text = whatsappSummary({ groupName: "X", names, nets: { you: 100, diya: -100 }, transfers: [{ from: "diya", to: "you", amount: 100 }] });
    expect(text).toContain("(1 payment)");
  });
});
