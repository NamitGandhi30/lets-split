import { allocate, assertPaise, MoneyError, sum, type Paise } from "./money.ts";
import type { Allocation, MemberId } from "./split.ts";

export interface ReceiptItem {
  id: string;
  name?: string;
  /** Line total in paise (quantity already applied). */
  amount: Paise;
  /** Who ate it, with weights (usually 1 each). A shared dish is split among its claimants. */
  claims: Record<MemberId, number>;
}

export interface ReceiptCharge {
  /** e.g. "CGST 2.5%", "Service charge", "Discount". */
  label: string;
  /** Positive for tax and service charge, negative for a discount. */
  amount: Paise;
}

export interface ItemizedInput {
  items: ReceiptItem[];
  charges?: ReceiptCharge[];
}

export interface ItemizedLine {
  /** What their dishes cost. */
  subtotal: Paise;
  /** Their proportional slice of tax, service charge and discounts. */
  charges: Paise;
  total: Paise;
}

export interface ItemizedResult {
  total: Paise;
  itemsTotal: Paise;
  chargesTotal: Paise;
  perMember: Record<MemberId, ItemizedLine>;
  /** Final shares, ready to store as an exact split. Adds up to `total`. */
  shares: Allocation;
}

/**
 * Split an itemized bill. Each dish is split among the people who claimed it, then tax,
 * service charge and discounts are shared in proportion to each person's dish subtotal.
 * Every step uses largest-remainder rounding, so the shares add up to the bill exactly.
 */
export function splitItemized(input: ItemizedInput): ItemizedResult {
  const charges = input.charges ?? [];
  if (input.items.length === 0) throw new MoneyError("NO_ITEMS", "the receipt has no items");

  const subtotals: Allocation = {};
  const unclaimed: string[] = [];
  for (const item of input.items) {
    assertPaise(item.amount, `item ${item.name ?? item.id}`);
    if (item.amount < 0) throw new MoneyError("INVALID_AMOUNT", "item amounts can't be negative");
    const who = Object.keys(item.claims).filter((k) => (item.claims[k] ?? 0) > 0);
    if (who.length === 0) {
      if (item.amount > 0) unclaimed.push(item.name ?? item.id);
      continue;
    }
    const parts = allocate(item.amount, who.map((k) => item.claims[k]!));
    who.forEach((k, i) => (subtotals[k] = (subtotals[k] ?? 0) + parts[i]!));
  }
  if (unclaimed.length) {
    throw new MoneyError("UNCLAIMED_ITEMS", `nobody claimed: ${unclaimed.join(", ")}`);
  }

  for (const c of charges) assertPaise(c.amount, c.label);
  const itemsTotal = sum(input.items.map((i) => i.amount));
  const chargesTotal = sum(charges.map((c) => c.amount));
  const total = itemsTotal + chargesTotal;
  if (total <= 0) throw new MoneyError("INVALID_AMOUNT", "the bill must be more than ₹0");

  const members = Object.keys(subtotals);
  const extra =
    chargesTotal === 0 ? members.map(() => 0) : allocate(chargesTotal, members.map((k) => subtotals[k]!));

  const perMember: Record<MemberId, ItemizedLine> = {};
  const shares: Allocation = {};
  members.forEach((k, i) => {
    const line = { subtotal: subtotals[k]!, charges: extra[i]!, total: subtotals[k]! + extra[i]! };
    if (line.total < 0) throw new MoneyError("NEGATIVE_SHARE", "the discount is bigger than someone's dishes");
    perMember[k] = line;
    if (line.total !== 0) shares[k] = line.total;
  });

  return { total, itemsTotal, chargesTotal, perMember, shares };
}

/** Does the parsed receipt add up? Returns the difference (parsed total − computed total). */
export function receiptMismatch(input: ItemizedInput, printedTotal: Paise): Paise {
  assertPaise(printedTotal, "printed total");
  const computed = sum(input.items.map((i) => i.amount)) + sum((input.charges ?? []).map((c) => c.amount));
  return printedTotal - computed;
}
