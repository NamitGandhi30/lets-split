import { formatINR } from "@lets-split/core";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { TripStats } from "../../api/client";
import { useGroups, useStats } from "../../api/hooks";
import { accentOr, isDark } from "../../lib/color";
import { useCurrentTripId } from "../../lib/currentTrip";
import { CATEGORIES, tileColor } from "../../lib/people";
import { Amount } from "../../ui/Amount";
import { bouncy, snappy } from "../../ui/motion";
import { useToast } from "../../ui/Toast";

// Layout follows the approved Figma "Stats" screen: title + Wrapped pill, total, flower chart with
// legend, and the dark daily-spend card.

const rupees = (p: number) => formatINR(p, { decimals: "never" });
const kShort = (p: number) => (p >= 1_00_000 * 100 ? `₹${(p / 1_00_000_00).toFixed(1)}L` : p >= 1_000_00 ? `₹${(p / 1_000_00).toFixed(1)}k` : rupees(p));
const labelOf = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

export function StatsScreen() {
  const groups = useGroups();
  const open = useMemo(() => (groups.data ?? []).filter((g) => !g.archivedAt), [groups.data]);
  const currentId = useCurrentTripId();
  const trip = open.find((g) => g.id === currentId) ?? open[0];
  const stats = useStats(trip?.id);
  const toast = useToast();

  if (groups.isPending) return <div className="h-full bg-sheet" />;
  if (!trip) {
    return (
      <div className="grid h-full place-items-center bg-sheet px-8 text-center text-ink">
        <div>
          <p className="text-[22px] font-bold">No trips yet</p>
          <p className="mt-2 text-[14px] text-muted">Stats show up once you start a trip and add a few expenses.</p>
          <Link to="/?new=1" className="mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">
            New trip
          </Link>
        </div>
      </div>
    );
  }

  const s = stats.data;
  const days = s?.days.length ?? 0;
  const accent = accentOr(trip.accent);

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-sheet text-ink">
      <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-bold tracking-[-0.01em]">Stats</h1>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            transition={snappy}
            onClick={() => toast("Trip Wrapped is coming in the next build")}
            className="flex h-8 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#FF2E93,#E8221B_55%,#B3121F)] pr-3.5 pl-1.5 text-[12.5px] font-semibold text-white shadow-[0_6px_16px_rgba(232,34,27,.28)]"
          >
            <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-white text-[9px] text-[#E8221B]" aria-hidden="true">
              ▶
            </span>
            {trip.name.split(" ")[0]} Wrapped
          </motion.button>
        </div>

        <p className="mt-5 truncate text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          {trip.name}
          {days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}
        </p>
        <div className="mt-1">
          <Amount paise={s?.totalSpentPaise ?? trip.totalSpentPaise} size={{ cur: 30, whole: 54, dec: 22 }} className="text-ink" />
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          {trip.memberCount} {trip.memberCount === 1 ? "person" : "people"}
          {s ? ` · ${rupees(s.perDayPaise)} a day` : ""}
          {s?.me ? ` · you paid ${rupees(s.me.paidPaise)}` : ""}
        </p>
      </div>

      {stats.isPending ? (
        <div className="mt-4 flex flex-col gap-3 px-[18px]">
          <div className="h-[330px] animate-pulse rounded-[24px] bg-card" />
          <div className="h-[190px] animate-pulse rounded-[24px] bg-[#1C1E23]" />
        </div>
      ) : !s || s.expenseCount === 0 ? (
        <div className="mx-[18px] mt-4 rounded-[24px] bg-card px-4 py-8 text-center text-[14px] leading-[1.5] text-muted">
          No expenses in {trip.name} yet.
          <br />
          <Link to={`/add?group=${trip.id}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-ink px-5 font-semibold text-white">
            Add the first one
          </Link>
        </div>
      ) : (
        <div key={trip.id} className="mt-4 flex flex-col gap-3 px-[18px]">
          <FlowerCard stats={s} />
          <DailyCard stats={s} accent={accent} />
        </div>
      )}
      <div className="h-[120px]" />
    </div>
  );
}

/** Category flower: one petal per category, longer for bigger spend. Tap a petal to see it in the middle. */
function FlowerCard({ stats }: { stats: TripStats }) {
  const cats = stats.categories;
  const [sel, setSel] = useState(0);
  const max = Math.max(1, ...cats.map((c) => c.paise));
  const n = cats.length;
  const cur = cats[Math.min(sel, n - 1)]!;
  const W = 220;
  const C = W / 2;
  const hub = 38;

  return (
    <section className="rounded-[24px] bg-card px-4 pt-5 pb-4">
      <div className="relative mx-auto" style={{ width: W, height: W }}>
        <svg viewBox={`0 0 ${W} ${W}`} width={W} height={W} className="overflow-visible">
          {cats.map((c, i) => {
            const len = 34 + 44 * Math.sqrt(c.paise / max);
            const rx = n <= 2 ? 34 : Math.min(30, 12 + 90 / n);
            const angle = (i * 360) / n;
            const on = i === sel;
            return (
              <g key={c.category} transform={`rotate(${angle} ${C} ${C})`}>
                <motion.ellipse
                  cx={C}
                  cy={C - hub + 6 - len / 2}
                  rx={rx}
                  ry={len / 2 + 6}
                  fill={tileColor(c.category)}
                  // Grow out from the flower's centre, not the petal's own box.
                  style={{ transformBox: "view-box", transformOrigin: `${C}px ${C}px` }}
                  initial={{ scale: 0 }}
                  animate={{ scale: on ? 1.07 : 1 }}
                  transition={{ ...bouncy, delay: 0.05 + i * 0.06 }}
                  onClick={() => setSel(i)}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`${labelOf(c.category)}, ${rupees(c.paise)}`}
                />
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-center shadow-[0_2px_10px_rgba(0,0,0,.08)]" style={{ width: hub * 2 + 4, height: hub * 2 + 4 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={cur.category} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={snappy}>
              <span className="block text-[10px] font-medium text-muted">{labelOf(cur.category)}</span>
              <b className="block text-[15px] leading-tight font-bold tracking-[-0.01em]">{rupees(cur.paise)}</b>
              <span className="block text-[10px] font-semibold text-muted">{Math.round(cur.percent)}%</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5">
        {cats.map((c, i) => (
          <button key={c.category} type="button" onClick={() => setSel(i)} className={`flex items-center gap-2 text-left text-[13px] transition-opacity ${i === sel || sel < 0 ? "" : "opacity-80"}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: tileColor(c.category) }} />
            <span className={`flex-1 truncate ${i === sel ? "font-semibold" : "font-medium"}`}>{labelOf(c.category)}</span>
            <span className="font-semibold tabular-nums">{rupees(c.paise)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Dark card: a pill per day, the peak day lit in the trip colour with its total above. */
function DailyCard({ stats, accent }: { stats: TripStats; accent: string }) {
  const max = Math.max(1, ...stats.days.map((d) => d.paise));
  const peak = stats.peakDay;
  const lit = isDark(accent) ? "#3FD0B6" : accent;
  const many = stats.days.length > 12;
  return (
    <section className="rounded-[24px] bg-[#141518] px-4 pt-4 pb-3.5 text-on-dark">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[15px] font-semibold">Daily spend</b>
        {peak && (
          <span className="truncate text-[12px] font-semibold" style={{ color: lit }}>
            Peak · D{peak.index + 1}
            {peak.topDescription ? ` ${peak.topDescription.toLowerCase()}` : ""}
          </span>
        )}
      </div>
      <div className={many ? "no-scrollbar -mx-1 overflow-x-auto px-1" : ""}>
        <div className={`mt-3 flex h-[132px] items-end ${many ? "gap-2.5" : "gap-2"}`} style={many ? { width: stats.days.length * 32 } : undefined}>
          {stats.days.map((d, i) => {
            const isPeak = peak?.index === i;
            return (
              <div key={d.date} className={`flex flex-col items-center gap-1.5 ${many ? "w-[22px] shrink-0" : "min-w-0 flex-1"}`}>
                {isPeak && (
                  <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...snappy, delay: 0.5 }} className="text-[10px] font-bold" style={{ color: lit }}>
                    {kShort(d.paise)}
                  </motion.span>
                )}
                <motion.i
                  className="block w-full max-w-[26px] origin-bottom rounded-full"
                  style={{ height: 16 + (d.paise / max) * 80, background: isPeak ? lit : "#2C2F35" }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ ...bouncy, delay: i * 0.05 }}
                />
                <span className="text-[9.5px] text-dimmer tabular-nums">D{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
