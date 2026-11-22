import { whatsappSummary } from "@lets-split/core";
import { motion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Group } from "../../api/client";
import { useActivity, useBalances, useGroups, useMe, useMembers, useRecentExpenses } from "../../api/hooks";
import { Amount, useCountUp } from "../../ui/Amount";
import { Avatar } from "../../ui/Avatar";
import { BellIcon, PlusIcon, UserPlusIcon } from "../../ui/icons";
import { snappy } from "../../ui/motion";
import { useToast } from "../../ui/Toast";
import { EmptyStack, TripStack } from "./TripStack";
import { ExpenseRow, RecentSheet } from "./RecentSheet";
import { SettleSheet, type SettleTarget } from "../settle/SettleSheet";
import { remindText, whatsappUrl } from "../settle/remind";
import { TripFormSheet } from "../trips/TripFormSheet";

function Pill({ children, primary, onClick }: { children: string; primary?: boolean; onClick?: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={snappy}
      onClick={onClick}
      className={`h-9 rounded-full px-4 text-[14px] font-semibold ${primary ? "bg-on-dark text-chrome" : "bg-raised text-on-dark-2"}`}
    >
      {children}
    </motion.button>
  );
}

export function HomeScreen() {
  const toast = useToast();
  const me = useMe();
  const all = useGroups();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const activity = useActivity();
  const openGroups = useMemo(() => all.data?.filter((g) => !g.archivedAt), [all.data]);
  const groups = { ...all, data: openGroups };
  const [current, setCurrent] = useState<Group | null>(null);
  const trip = current && openGroups?.some((g) => g.id === current.id) ? (openGroups.find((g) => g.id === current.id) ?? null) : (openGroups?.[0] ?? null);
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const newTrip = params.get("new") === "1";
  const setNewTrip = (o: boolean) =>
    setParams((p) => {
      if (o) p.set("new", "1");
      else p.delete("new");
      return p;
    }, { replace: true });

  const balances = useBalances(trip?.id);
  const members = useMembers(trip?.id);
  const recent = useRecentExpenses(trip?.id);
  const memberMap = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);

  const net = balances.data?.me?.netPaise ?? 0;

  // Sheet geometry: collapsed just under the trip stack, expanded near the top (prototype: 404 / 96).
  const screen = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ col: 0, exp: 96 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!stack.current || !screen.current) return;
      const top = screen.current.getBoundingClientRect().top;
      const r = stack.current.getBoundingClientRect();
      const safeTop = parseFloat(getComputedStyle(screen.current).paddingTop) || 0;
      setGeo({ col: Math.round(r.bottom - top + 26), exp: Math.round(safeTop + 40) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (screen.current) ro.observe(screen.current);
    return () => ro.disconnect();
  }, []);

  const label = !trip
    ? "Your balance"
    : net > 0
      ? `You're owed in ${trip.name}`
      : net < 0
        ? `You owe in ${trip.name}`
        : `All square in ${trip.name}`;

  async function share() {
    if (!trip || !balances.data || !members.data) return;
    const names = Object.fromEntries(members.data.map((m) => [m.id, m.isMe ? "You" : m.displayName]));
    const text = whatsappSummary({
      groupName: trip.name,
      names,
      totalSpent: balances.data.totalSpentPaise,
      nets: Object.fromEntries(balances.data.nets.map((n) => [n.memberId, n.netPaise])),
      transfers: balances.data.transfers.map((t) => ({ from: t.from, to: t.to, amount: t.amountPaise })),
      upiIds: me.data?.upiId && balances.data.me ? { [balances.data.me.memberId]: me.data.upiId } : undefined,
    });
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Summary copied. Paste it in WhatsApp.");
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  const unread = activity.data?.unreadCount ?? 0;
  const transfers = balances.data?.transfers ?? [];
  const myMember = trip?.myMemberId;

  function settleUp() {
    if (!trip) return setNewTrip(true);
    const mine = transfers.filter((t) => t.from === myMember).sort((a, b) => b.amountPaise - a.amountPaise)[0];
    if (mine) return setSettle(mine);
    if (transfers.some((t) => t.to === myMember)) return nav(`/trips/${trip.id}?tab=bal`);
    toast(`You're all square in ${trip.name}`);
  }

  function remind() {
    if (!trip) return;
    const owed = transfers.filter((t) => t.to === myMember);
    if (!owed.length) return toast(net < 0 ? "You're the one who owes. Settle up instead?" : `Nobody owes you in ${trip.name}`);
    const text = owed.map((t) => remindText(t, memberMap, trip.name)).join("\n\n");
    window.open(whatsappUrl(text), "_blank", "noopener");
  }

  return (
    <div ref={screen} className="relative h-full overflow-hidden bg-chrome pt-safe">
      <header className="flex items-center gap-2.5 px-[22px] pt-2">
        <Link to="/me" aria-label="Your profile">
          <Avatar seed={me.data?.id ?? "you"} avatarKey={me.data?.avatarKey ?? "you"} photoUrl={me.data?.avatarUrl} size={40} />
        </Link>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={snappy}
          onClick={() => setNewTrip(true)}
          aria-label="New trip"
          className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-surface text-on-dark"
        >
          <PlusIcon width={18} height={18} />
        </motion.button>
        <Link
          to="/alerts"
          aria-label={unread ? `Alerts, ${unread} new` : "Alerts"}
          className="relative grid h-10 w-10 place-items-center rounded-full bg-surface text-on-dark"
        >
          <BellIcon />
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 170, damping: 13 }}
              className="absolute top-[9px] right-[10px] h-2 w-2 rounded-full bg-alert ring-2 ring-surface"
            />
          )}
        </Link>
      </header>

      <section className="px-6 pt-5">
        <p className="text-[14px] text-dim">{label}</p>
        <div className="mt-1">
          <CountUpAmount
            paise={net}
            absolute
            size={{ cur: 26, whole: 56, dec: 22 }}
            className="text-on-dark"
            wholeStyle={{ color: net < 0 ? "var(--color-neg-soft)" : undefined }}
          />
        </div>
        <div className="mt-3.5 flex gap-2">
          <Pill primary onClick={settleUp}>
            Settle up
          </Pill>
          <Pill onClick={remind}>Remind</Pill>
          <Pill onClick={share}>Share</Pill>
        </div>
      </section>

      <div ref={stack} className="mt-[26px] px-6">
        {groups.isPending ? (
          <div className="h-[78px] w-[min(300px,calc(100%-28px))] animate-pulse rounded-[20px] bg-surface" />
        ) : groups.data?.length ? (
          <TripStack groups={groups.data} onChange={setCurrent} />
        ) : (
          <button type="button" onClick={() => setNewTrip(true)} className="block text-left">
            <EmptyStack />
          </button>
        )}
      </div>

      <RecentSheet
        collapsedY={geo.col}
        expandedY={geo.exp}
        header={
          <div className="flex items-baseline justify-between px-[22px] pt-1 pb-3">
            <b className="text-[17px] font-semibold">{trip ? `Recent in ${trip.name}` : "Recent"}</b>
            {trip && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => nav(`/trips/${trip.id}`)}
                className="text-[13px] font-medium text-muted"
              >
                See all ›
              </button>
            )}
          </div>
        }
      >
        {trip && (
          <div className="mx-[18px] mb-3 flex gap-2">
            <Link
              to={`/add?group=${trip.id}`}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-semibold text-white active:scale-[0.97] transition-transform"
            >
              <PlusIcon width={16} height={16} /> Add expense
            </Link>
            <Link
              to={`/trips/${trip.id}?invite=1`}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-card text-[14px] font-semibold text-ink active:scale-[0.97] transition-transform"
            >
              <UserPlusIcon width={16} height={16} /> {trip.memberCount < 2 ? "Invite crew" : "Add people"}
            </Link>
          </div>
        )}
        <div className="mx-[18px] rounded-[var(--radius-card)] bg-card px-3.5 py-1">
          {groups.isError || recent.isError ? (
            <p className="py-6 text-center text-[14px] text-muted">Couldn't load. Pull down or try again in a bit.</p>
          ) : !trip ? (
            <p className="py-6 text-center text-[14px] leading-[1.5] text-muted">
              Nothing here yet.
              <br />
              Expenses you add will show up here.
            </p>
          ) : recent.isPending ? (
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <span className="h-[42px] w-[42px] animate-pulse rounded-[13px] bg-hairline" />
                <span className="h-4 flex-1 animate-pulse rounded bg-hairline" />
              </div>
            ))
          ) : recent.data?.items.length ? (
            <div key={trip.id}>
              {recent.data.items.map((e, i) => (
                <Link key={e.id} to={`/expenses/${e.id}`} className="block">
                  <ExpenseRow e={e} i={i} members={memberMap} myMemberId={trip.myMemberId} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[14px] text-muted">No expenses in {trip.name} yet. Tap ＋ to add one.</p>
          )}
        </div>
      </RecentSheet>
      <TripFormSheet open={newTrip} onClose={() => setNewTrip(false)} />
      {trip && settle && <SettleSheet open onClose={() => setSettle(null)} group={trip} members={members.data ?? []} target={settle} />}
    </div>
  );
}

/** Only this re-renders on each count-up frame, not the whole Home screen. */
function CountUpAmount(props: React.ComponentProps<typeof Amount>) {
  const shown = useCountUp(props.paise);
  return <Amount {...props} paise={shown} />;
}
