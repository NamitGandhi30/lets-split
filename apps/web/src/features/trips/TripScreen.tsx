import { formatINR } from "@lets-split/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { Expense, Member } from "../../api/client";
import { useAllExpenses, useBalances, useGroup, useMembers, useSettlements } from "../../api/hooks";
import { useWrite, withKey } from "../../api/mutations";
import { dayLabel, firstName, nameOf } from "../../lib/people";
import { Amount } from "../../ui/Amount";
import { Avatar } from "../../ui/Avatar";
import { BackIcon, MoreIcon, PlusIcon, UserPlusIcon } from "../../ui/icons";
import { listItem, snappy } from "../../ui/motion";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { ExpenseRow } from "../home/RecentSheet";
import { SettleSheet, type SettleTarget } from "../settle/SettleSheet";
import { remindText } from "../settle/remind";
import { InviteSheet } from "./InviteSheet";
import { TripFormSheet } from "./TripFormSheet";

type Tab = "exp" | "bal";

export function TripScreen() {
  const { groupId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const balances = useBalances(groupId);
  const expenses = useAllExpenses(groupId);
  const settlements = useSettlements(groupId);
  const archive = useWrite("archiveGroup");
  const [tab, setTab] = useState<Tab>(params.get("tab") === "bal" ? "bal" : "exp");
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const inviteOpen = params.get("invite") === "1";
  const setInvite = (o: boolean) =>
    setParams((p) => {
      if (o) p.set("invite", "1");
      else p.delete("invite");
      return p;
    }, { replace: true });

  const memberMap = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);
  const g = group.data;
  const accent = g?.accent ?? "#F4D23C";

  useEffect(() => {
    if (group.isError) nav("/", { replace: true });
  }, [group.isError, nav]);

  const items = expenses.data?.pages.flatMap((p) => p.items) ?? [];
  const days = useMemo(() => {
    const out: { label: string; items: Expense[] }[] = [];
    for (const e of items) {
      const label = dayLabel(e.spentAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [items]);

  const net = balances.data?.me?.netPaise ?? 0;
  const active = (members.data ?? []).filter((m) => !m.removedAt);

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-sheet text-ink">
      <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-5 transition-colors duration-500" style={{ background: accent }}>
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Back to home" className="grid h-10 w-10 place-items-center rounded-full bg-card">
            <BackIcon />
          </Link>
          <div className="flex gap-2">
            <button type="button" aria-label="Invite people" onClick={() => setInvite(true)} className="grid h-10 w-10 place-items-center rounded-full bg-card">
              <UserPlusIcon />
            </button>
            <button type="button" aria-label="Trip options" onClick={() => setMenu(true)} className="grid h-10 w-10 place-items-center rounded-full bg-card">
              <MoreIcon />
            </button>
            <Link to={`/add?group=${groupId}`} aria-label="Add expense" className="grid h-10 w-10 place-items-center rounded-full bg-card">
              <PlusIcon />
            </Link>
          </div>
        </div>
        <h1 className="mt-[18px] mb-0.5 text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em]">{g?.name ?? " "}</h1>
        <p className="text-[13px] opacity-75">
          {[`${active.length || g?.memberCount || 0} people`, g?.location, g?.archivedAt ? "Archived" : null].filter(Boolean).join(" · ")}
        </p>
        <button type="button" onClick={() => setInvite(true)} className="mt-3.5 flex" aria-label="People in this trip">
          {active.slice(0, 8).map((m) => (
            <Avatar key={m.id} seed={m.id} avatarKey={m.avatarKey} size={34} className={`-mr-2 border-2 border-white ${m.isPlaceholder ? "opacity-60" : ""}`} />
          ))}
        </button>
        <div className="mt-4 flex gap-2.5">
          <div className="flex-1 rounded-[18px] bg-white/45 p-3">
            <span className="block text-[11px] font-semibold opacity-70">TOTAL SPENT</span>
            <Amount paise={g?.totalSpentPaise ?? 0} size={{ cur: 15, whole: 20, dec: 13 }} />
          </div>
          <div className="flex-1 rounded-[18px] bg-white/45 p-3">
            <span className="block text-[11px] font-semibold opacity-70">{net < 0 ? "YOU OWE" : net > 0 ? "YOU'RE OWED" : "ALL SQUARE"}</span>
            <Amount paise={net} absolute size={{ cur: 15, whole: 20, dec: 13 }} />
          </div>
        </div>
      </div>

      <div className="relative mx-[18px] mt-3.5 mb-1.5 flex gap-1 rounded-full bg-[#E5E6EA] p-1" role="tablist">
        {(["exp", "bal"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative z-10 h-9 flex-1 rounded-full text-[14px] font-semibold transition-colors ${tab === t ? "text-ink" : "text-muted"}`}
          >
            {tab === t && <motion.span layoutId="ptab" transition={snappy} className="absolute inset-0 -z-10 rounded-full bg-card" />}
            {t === "exp" ? "Expenses" : "Balances"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, x: tab === "bal" ? 24 : -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={snappy}>
          {tab === "exp" ? (
            expenses.isPending ? (
              <div className="mx-[18px] mt-4 h-40 animate-pulse rounded-[var(--radius-card)] bg-card" />
            ) : days.length === 0 ? (
              <div className="mx-[18px] mt-4 rounded-[var(--radius-card)] bg-card px-5 py-8 text-center text-[14px] leading-[1.5] text-muted">
                No expenses yet.
                <br />
                <Link to={`/add?group=${groupId}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-ink px-5 font-semibold text-white">
                  Add the first one
                </Link>
              </div>
            ) : (
              <>
                {days.map((d) => (
                  <section key={d.label}>
                    <h3 className="mx-[22px] mt-4 mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">{d.label}</h3>
                    <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-3.5 py-0.5">
                      {d.items.map((e, i) => (
                        <Link key={e.id} to={`/expenses/${e.id}`} className="block">
                          <ExpenseRow e={e} i={i} members={memberMap} myMemberId={g?.myMemberId ?? null} />
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
                {expenses.hasNextPage && (
                  <button type="button" onClick={() => expenses.fetchNextPage()} className="mx-auto mt-4 block h-10 rounded-full bg-card px-5 text-[13px] font-semibold">
                    {expenses.isFetchingNextPage ? "Loading…" : "Show older"}
                  </button>
                )}
              </>
            )
          ) : (
            <BalancesTab
              members={memberMap}
              transfers={balances.data?.transfers ?? []}
              nets={balances.data?.nets ?? []}
              myMemberId={g?.myMemberId ?? null}
              tripName={g?.name ?? ""}
              recent={(settlements.data ?? []).slice(0, 5)}
              onSettle={setSettle}
              onRemind={(t) => {
                const text = remindText(t, memberMap, g?.name ?? "");
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
              }}
            />
          )}
          <div className="h-[110px]" />
        </motion.div>
      </AnimatePresence>

      {g && <InviteSheet open={inviteOpen} onClose={() => setInvite(false)} group={g} members={members.data ?? []} />}
      {g && <TripFormSheet open={edit} onClose={() => setEdit(false)} group={g} />}
      <Sheet open={menu} onClose={() => setMenu(false)} title={g?.name}>
        <div className="flex flex-col gap-2">
          {[
            { label: "Edit trip", onClick: () => setEdit(true) },
            { label: "Invite people", onClick: () => setInvite(true) },
            {
              label: g?.archivedAt ? "Unarchive trip" : "Archive trip",
              onClick: () => {
                if (!g) return;
                const archived = !g.archivedAt;
                archive.mutate(withKey({ groupId: g.id, archived }));
                toast(archived ? `${g.name} archived` : `${g.name} is back`, archived ? { label: "Undo", onClick: () => archive.mutate(withKey({ groupId: g.id, archived: false })) } : undefined);
                if (archived) nav("/");
              },
            },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setMenu(false);
                a.onClick();
              }}
              className="h-[52px] rounded-[16px] bg-card px-4 text-left text-[15px] font-semibold"
            >
              {a.label}
            </button>
          ))}
        </div>
      </Sheet>
      {g && settle && <SettleSheet open onClose={() => setSettle(null)} group={g} members={members.data ?? []} target={settle} />}
    </div>
  );
}

function BalancesTab({
  members, transfers, nets, myMemberId, tripName, recent, onSettle, onRemind,
}: {
  members: Map<string, Member>;
  transfers: { from: string; to: string; amountPaise: number }[];
  nets: { memberId: string; netPaise: number }[];
  myMemberId: string | null;
  tripName: string;
  recent: { id: string; fromMemberId: string; toMemberId: string; amountPaise: number; method: string; settledAt: string }[];
  onSettle: (t: SettleTarget) => void;
  onRemind: (t: SettleTarget) => void;
}) {
  const shown = nets.filter((n) => n.netPaise !== 0 || members.get(n.memberId)?.isMe);
  const max = Math.max(1, ...shown.map((n) => Math.abs(n.netPaise)));
  return (
    <>
      <h3 className="mx-[22px] mt-4 mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">
        {transfers.length ? `SIMPLIFIED · ${transfers.length} PAYMENT${transfers.length === 1 ? "" : "S"}` : "SETTLED UP"}
      </h3>
      <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-4 py-1">
        {transfers.length === 0 && <p className="py-5 text-center text-[14px] text-muted">Everyone's square in {tripName}. Nice.</p>}
        {transfers.map((t, i) => {
          const from = members.get(t.from);
          const to = members.get(t.to);
          const iPay = t.from === myMemberId;
          const iGet = t.to === myMemberId;
          return (
            <motion.div key={`${t.from}-${t.to}`} {...listItem(i)} className="flex items-center gap-2.5 border-b border-hairline py-3 last:border-b-0">
              <Avatar seed={t.from} avatarKey={from?.avatarKey} size={30} />
              <span className="min-w-0 flex-1 text-[14px] leading-[1.3]">
                {iPay ? (
                  <>You pay <b className="font-semibold">{firstName(to)}</b></>
                ) : iGet ? (
                  <><b className="font-semibold">{firstName(from)}</b> pays you</>
                ) : (
                  <><b className="font-semibold">{firstName(from)}</b> pays <b className="font-semibold">{firstName(to)}</b></>
                )}
                {!iPay && <span className="block text-[12px] text-muted">{formatINR(t.amountPaise)}</span>}
              </span>
              {iPay ? (
                <motion.button type="button" whileTap={{ scale: 0.95 }} transition={snappy} onClick={() => onSettle({ ...t })} className="h-8 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-white">
                  Pay {formatINR(t.amountPaise, { decimals: "auto" })}
                </motion.button>
              ) : iGet ? (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => onRemind({ ...t })} className="h-8 rounded-full bg-sheet px-3 text-[12.5px] font-semibold">Remind</button>
                  <button type="button" onClick={() => onSettle({ ...t })} className="h-8 rounded-full bg-ink px-3 text-[12.5px] font-semibold text-white">Got it</button>
                </div>
              ) : (
                <button type="button" onClick={() => onSettle({ ...t })} className="h-8 rounded-full bg-sheet px-3 text-[12.5px] font-semibold">Record</button>
              )}
            </motion.div>
          );
        })}
      </div>

      <h3 className="mx-[22px] mt-4 mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">NET BALANCES</h3>
      <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-4 py-1.5">
        {shown.map((n, i) => {
          const m = members.get(n.memberId);
          const pos = n.netPaise >= 0;
          return (
            <div key={n.memberId} className="flex items-center gap-2.5 py-2.5">
              <Avatar seed={n.memberId} avatarKey={m?.avatarKey} size={28} />
              <span className="w-[72px] truncate text-[14px] font-semibold">{nameOf(m)}</span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-hairline">
                <motion.i
                  className="absolute inset-y-0 left-0 block origin-left rounded-full"
                  style={{ width: `${(Math.abs(n.netPaise) / max) * 100}%`, background: pos ? "var(--color-pos)" : "var(--color-neg)" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, ease: [0.2, 0.9, 0.2, 1], delay: i * 0.06 }}
                />
              </span>
              <span className={`w-[84px] text-right text-[14px] font-bold ${n.netPaise === 0 ? "text-muted" : pos ? "text-pos" : "text-neg"}`}>
                {n.netPaise === 0 ? "square" : `${pos ? "+" : "−"}${formatINR(Math.abs(n.netPaise), { decimals: "auto" })}`}
              </span>
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <>
          <h3 className="mx-[22px] mt-4 mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">SETTLED</h3>
          <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-4 py-1">
            {recent.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 border-b border-hairline py-2.5 text-[13.5px] last:border-b-0">
                <span className="flex-1">
                  <b className="font-semibold">{nameOf(members.get(s.fromMemberId))}</b> paid <b className="font-semibold">{nameOf(members.get(s.toMemberId), "you")}</b>
                  <span className="block text-[12px] text-muted">{s.method === "upi" ? "UPI" : s.method === "cash" ? "Cash" : "Other"} · {dayLabel(s.settledAt).toLowerCase()}</span>
                </span>
                <b className="font-semibold text-pos">{formatINR(s.amountPaise, { decimals: "auto" })}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
