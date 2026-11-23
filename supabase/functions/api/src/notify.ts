import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRow } from "./mappers.ts";
import { inBackground, pushEnabled, pushRupees as rupees, sendPush, type PushMessage } from "./push.ts";

/** Who gets told about what. Every builder runs after the write succeeded, in the background. */

async function groupName(db: SupabaseClient, groupId: string): Promise<string> {
  const { data } = await db.from("groups").select("name").eq("id", groupId).maybeSingle<{ name: string }>();
  return data?.name ?? "your trip";
}

async function membersOf(db: SupabaseClient, groupId: string): Promise<MemberRow[]> {
  const { data } = await db.from("group_members").select("*").eq("group_id", groupId).returns<MemberRow[]>();
  return data ?? [];
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/** A new expense: everyone with a share or who paid, except the person who added it. */
export function notifyExpenseAdded(
  db: SupabaseClient,
  me: string,
  groupId: string,
  e: { id: string; description: string; amountPaise: number; shares: { memberId: string; amountPaise: number }[]; payers: { memberId: string; amountPaise: number }[] },
  members: MemberRow[],
): void {
  if (!pushEnabled()) return;
  inBackground(
    (async () => {
      const actor = members.find((m) => m.user_id === me);
      const name = await groupName(db, groupId);
      const out = new Map<string, PushMessage>();
      for (const m of members) {
        if (!m.user_id || m.user_id === me || m.removed_at) continue;
        const share = e.shares.find((s) => s.memberId === m.id)?.amountPaise ?? 0;
        const paid = e.payers.find((p) => p.memberId === m.id)?.amountPaise ?? 0;
        if (!share && !paid) continue;
        const net = paid - share;
        const tail = net < 0 ? `You owe ${rupees(-net)}` : net > 0 ? `You get back ${rupees(net)}` : "You're even on this one";
        out.set(m.user_id, {
          title: name,
          body: `${first(actor?.display_name ?? "Someone")} added ${e.description} · ${rupees(e.amountPaise)}\n${tail}`,
          url: `/expenses/${e.id}`,
        });
      }
      await sendPush(out);
    })(),
  );
}

/** A payment: the payer and payee, except whoever recorded it. */
export function notifySettlement(
  db: SupabaseClient,
  me: string,
  groupId: string,
  s: { fromMemberId: string; toMemberId: string; amountPaise: number; method: string },
): void {
  if (!pushEnabled()) return;
  inBackground(
    (async () => {
      const [members, name] = await Promise.all([membersOf(db, groupId), groupName(db, groupId)]);
      const byId = new Map(members.map((m) => [m.id, m]));
      const actor = members.find((m) => m.user_id === me);
      const from = byId.get(s.fromMemberId);
      const to = byId.get(s.toMemberId);
      const who = first(actor?.display_name ?? "Someone");
      const amt = rupees(s.amountPaise);
      const via = s.method === "upi" ? " on UPI" : s.method === "cash" ? " in cash" : "";
      const url = `/trips/${groupId}?tab=bal`;
      const out = new Map<string, PushMessage>();
      if (to?.user_id && to.user_id !== me) {
        out.set(to.user_id, {
          title: name,
          body: from?.user_id === me ? `${who} paid you ${amt}${via} 🎉` : `${who} noted that ${first(from?.display_name ?? "someone")} paid you ${amt}${via}`,
          url,
        });
      }
      if (from?.user_id && from.user_id !== me) {
        out.set(from.user_id, {
          title: name,
          body: to?.user_id === me ? `${who} got your ${amt}${via}. Marked as paid ✓` : `${who} noted your ${amt} to ${first(to?.display_name ?? "someone")}${via}`,
          url,
        });
      }
      await sendPush(out);
    })(),
  );
}

/** "Remind": one person, right now. Returns how many of their devices got it. */
export async function sendNudge(db: SupabaseClient, me: string, groupId: string, target: MemberRow, amountPaise: number | undefined): Promise<number> {
  if (!target.user_id || !pushEnabled()) return 0;
  const [members, name] = await Promise.all([membersOf(db, groupId), groupName(db, groupId)]);
  const actor = members.find((m) => m.user_id === me);
  const owe = amountPaise ? `You owe ${rupees(amountPaise)} in ${name}.` : `Time to settle up ${name}.`;
  return sendPush(
    new Map([
      [target.user_id, { title: `${first(actor?.display_name ?? "A friend")} sent a reminder`, body: `${owe} Tap to pay on UPI.`, url: `/trips/${groupId}?tab=bal`, tag: `nudge-${groupId}` }],
    ]),
  );
}
