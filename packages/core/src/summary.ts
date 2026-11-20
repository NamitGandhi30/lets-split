import { formatINR } from "./format.ts";
import type { Paise } from "./money.ts";
import type { Transfer } from "./balances.ts";
import type { Allocation, MemberId } from "./split.ts";

export interface SummaryInput {
  groupName: string;
  /** Display names. The current user can be passed as "You". */
  names: Record<MemberId, string>;
  /** Net balances (positive = is owed). */
  nets: Allocation;
  /** Who pays whom; usually the simplified plan. */
  transfers: readonly Transfer[];
  totalSpent?: Paise;
  /** UPI IDs to print next to people who should be paid. */
  upiIds?: Record<MemberId, string | undefined>;
}

/**
 * Plain-text balance summary formatted for WhatsApp (*bold*, bullet lines), shared through the
 * iOS share sheet. Lines stay short so they read well in a chat bubble.
 */
export function whatsappSummary(s: SummaryInput): string {
  const name = (id: MemberId) => s.names[id] ?? "Someone";
  const lines: string[] = [`*${s.groupName}* · balances`];
  if (s.totalSpent !== undefined) lines.push(`Total spent: ${formatINR(s.totalSpent)}`);
  lines.push("");

  if (s.transfers.length === 0) {
    lines.push("Everyone is settled up ✅");
  } else {
    const n = s.transfers.length;
    lines.push(`*To settle up* (${n} payment${n === 1 ? "" : "s"})`);
    for (const t of s.transfers) lines.push(`• ${name(t.from)} → ${name(t.to)}: ${formatINR(t.amount)}`);

    const payees = [...new Set(s.transfers.map((t) => t.to))].filter((id) => s.upiIds?.[id]);
    if (payees.length) {
      lines.push("", "*UPI*");
      for (const id of payees) lines.push(`${name(id)}: ${s.upiIds![id]}`);
    }

    const rows = Object.entries(s.nets).filter(([, v]) => v !== 0).sort(([, a], [, b]) => b - a);
    if (rows.length) {
      lines.push("", "*Net*");
      for (const [id, v] of rows) lines.push(`${name(id)}: ${v > 0 ? "gets back" : "owes"} ${formatINR(Math.abs(v))}`);
    }
  }

  lines.push("", "_Sent from Let's Split_");
  return lines.join("\n");
}
