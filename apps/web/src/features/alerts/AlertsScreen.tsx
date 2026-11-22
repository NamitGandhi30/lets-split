import { formatINR } from "@lets-split/core";
import { PullToRefresh } from "../../ui/PullToRefresh";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { ActivityItem } from "../../api/client";
import { useActivity } from "../../api/hooks";
import { useWrite, withKey } from "../../api/mutations";
import { ago, when } from "../../lib/people";
import { Avatar } from "../../ui/Avatar";
import { listItem } from "../../ui/motion";
import { PageHeader } from "../../ui/PageHeader";

const money = (v: unknown) => (typeof v === "number" ? formatINR(v, { decimals: "auto" }) : "");

function describe(a: ActivityItem): { title: string; sub: string; to?: string; action?: string } {
  const who = a.isMine ? "You" : (a.actorName ?? "Someone");
  const d = a.data as Record<string, unknown>;
  const desc = String(d.description ?? "an expense");
  const trip = a.groupName;
  switch (a.kind) {
    case "expense.added":
      return { title: `${who} added ${desc}`, sub: `${trip} · ${money(d.amount_paise)}`, to: `/expenses/${a.entityId}` };
    case "expense.edited":
      return { title: `${who} edited ${desc}`, sub: `${trip} · ${money(d.amount_paise)}`, to: `/expenses/${a.entityId}` };
    case "expense.deleted":
      return { title: `${who} deleted ${desc}`, sub: trip, to: `/expenses/${a.entityId}` };
    case "expense.restored":
      return { title: `${who} restored ${desc}`, sub: trip, to: `/expenses/${a.entityId}` };
    case "comment.added":
      return { title: `${who} commented on ${desc}`, sub: `“${String(d.body ?? "")}”`, to: `/expenses/${a.entityId}` };
    case "settlement.added": {
      const from = d.fromMe ? "You" : String(d.fromName ?? "Someone");
      const to = d.toMe ? "you" : String(d.toName ?? "someone");
      const via = d.method === "upi" ? "via UPI" : d.method === "cash" ? "in cash" : "";
      return { title: `${from} paid ${to} ${money(d.amount_paise)}`, sub: `${trip} · ${via}`.replace(/ · $/, ""), to: `/trips/${a.groupId}?tab=bal` };
    }
    case "settlement.deleted":
      return { title: `${who} undid a ${money(d.amount_paise)} payment`, sub: trip, to: `/trips/${a.groupId}?tab=bal` };
    case "member.added":
      if (d.created) return { title: `${who} created ${trip}`, sub: "Invite people from the trip page", to: `/trips/${a.groupId}` };
      return { title: `${String(d.display_name)} was added to ${trip}`, sub: `Added by ${who === "You" ? "you" : who}`, to: `/trips/${a.groupId}` };
    case "member.claimed":
      return { title: `${String(d.display_name)} joined ${trip}`, sub: "Claimed their spot from the invite link", to: `/trips/${a.groupId}` };
    case "member.removed":
      return { title: `${String(d.display_name)} left ${trip}`, sub: `Removed by ${who === "You" ? "you" : who}`, to: `/trips/${a.groupId}` };
    default:
      return { title: `${who} updated ${trip}`, sub: "" };
  }
}

export function AlertsScreen() {
  const feed = useActivity();
  const seen = useWrite("markSeen");
  const marked = useRef(false);

  // Opening alerts clears the red dot (unread rows stay highlighted for this visit).
  useEffect(() => {
    if (marked.current || !feed.data || feed.data.unreadCount === 0) return;
    marked.current = true;
    const t = setTimeout(() => seen.mutate(withKey({})), 1500);
    return () => clearTimeout(t);
  }, [feed.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = feed.data?.items ?? [];
  const today = items.filter((i) => when(i.createdAt) === "Today");
  const earlier = items.filter((i) => when(i.createdAt) !== "Today");

  return (
    <PullToRefresh className="bg-sheet text-ink" onRefresh={() => feed.refetch()}>
      <PageHeader title="Alerts" />
      {feed.isPending ? (
        <div className="mx-[18px] mt-4 h-48 animate-pulse rounded-[var(--radius-card)] bg-card" />
      ) : items.length === 0 ? (
        <>
          <p className="mx-[22px] mt-4 mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">TODAY</p>
          <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-4 py-8 text-center text-[14px] leading-[1.5] text-muted">
            You're all caught up.
            <br />
            New expenses, reminders and settle-ups will land here.
          </div>
        </>
      ) : (
        [
          { label: "TODAY", list: today },
          { label: "EARLIER", list: earlier },
        ]
          .filter((s) => s.list.length)
          .map((s) => (
            <section key={s.label}>
              <p className="mx-[22px] mt-4 mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">{s.label}</p>
              <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-3.5 py-0.5">
                {s.list.map((a, i) => {
                  const d = describe(a);
                  const owesMe = a.kind === "expense.added" && !a.isMine;
                  const row = (
                    <motion.div {...listItem(i)} className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0">
                      <span className="relative">
                        <Avatar seed={a.actorMemberId ?? a.actorId ?? a.groupId} avatarKey={a.actorAvatarKey} size={40} />
                        <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: a.groupAccent ?? "#F4D23C" }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[14px] font-semibold">{d.title}</b>
                        <span className="block truncate text-[12px] text-muted">
                          {d.sub} · {ago(a.createdAt)}
                        </span>
                      </div>
                      {a.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-alert" aria-label="New" />}
                      {owesMe && !a.unread && <span className="h-[30px] shrink-0 rounded-full bg-ink px-3 text-[12.5px] leading-[30px] font-semibold text-white">View</span>}
                    </motion.div>
                  );
                  return d.to ? (
                    <Link key={a.id} to={d.to} className="block">
                      {row}
                    </Link>
                  ) : (
                    <div key={a.id}>{row}</div>
                  );
                })}
              </div>
            </section>
          ))
      )}
      <div className="h-[110px]" />
    </PullToRefresh>
  );
}
