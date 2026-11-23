import { formatINR } from "@lets-split/core";
import { api, idem, unwrap, type Member } from "../../api/client";
import { firstName } from "../../lib/people";
import { newId } from "../../lib/uuid";
import { useToast } from "../../ui/Toast";

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

/**
 * Remind people who owe you: a lock screen notification when they have the app with
 * notifications on, otherwise (or as well) a WhatsApp message one tap away.
 */
export function useRemind() {
  const toast = useToast();
  return async (groupId: string, owed: { from: string; to: string; amountPaise: number }[], members: Map<string, Member>, tripName: string) => {
    const text = owed.map((t) => remindText(t, members, tripName)).join("\n\n");
    const openWhatsApp = () => window.open(whatsappUrl(text), "_blank", "noopener");
    const reachable = owed.filter((t) => {
      const m = members.get(t.from);
      return m && !m.isPlaceholder && !m.removedAt;
    });
    if (!reachable.length || !navigator.onLine) return openWhatsApp();
    const results = await Promise.all(
      reachable.map((t) =>
        unwrap(api.POST("/api/v1/groups/{groupId}/nudges", { params: { path: { groupId } }, body: { memberId: t.from, amountPaise: t.amountPaise }, ...idem(newId()) }))
          .then((r) => (r.delivered > 0 ? t.from : null))
          .catch(() => null),
      ),
    );
    const sent = results.filter((x): x is string => x !== null).map((id) => firstName(members.get(id)));
    if (!sent.length) {
      const who = owed.length === 1 ? firstName(members.get(owed[0]!.from)) : "They";
      return toast(`${who} ${owed.length === 1 ? "hasn't" : "haven't"} turned on notifications`, { label: "WhatsApp", onClick: openWhatsApp });
    }
    toast(`Reminder sent to ${sent.join(", ")}`, { label: "WhatsApp too", onClick: openWhatsApp });
  };
}
