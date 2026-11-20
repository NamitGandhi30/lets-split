import { formatINR } from "@lets-split/core";
import type { Member } from "../../api/client";
import { firstName } from "../../lib/people";

/** A friendly WhatsApp nudge for one payment, with the UPI ID when we know it. */
export function remindText(t: { from: string; to: string; amountPaise: number }, members: Map<string, Member>, tripName: string): string {
  const from = members.get(t.from);
  const to = members.get(t.to);
  const amount = formatINR(t.amountPaise);
  const lines = [`Hey ${firstName(from, "")}! Settling up ${tripName}: you owe ${to?.isMe ? "me" : firstName(to)} ${amount}.`];
  if (to?.upiId) lines.push(`UPI: ${to.upiId}`);
  lines.push(`Open Let's Split to pay in one tap: ${window.location.origin}`);
  return lines.join("\n");
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
