import { formatINR } from "@lets-split/core";
import { formatMoney } from "../../lib/fx";
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import type { Expense, Member } from "../../api/client";
import { listItem, snappy } from "../../ui/motion";

/** Category tile colours from the design system (Stats "where it went" uses the same set). */
const CATEGORY_COLORS: Record<string, string> = {
  food: "#F28C38",
  travel: "#3A7BD5",
  drinks: "#8E5BD9",
  stay: "#2F6B4F",
  fun: "#E2557A",
  shopping: "#C9A227",
  other: "#9AA59D",
};
const tileColor = (category: string | null) => CATEGORY_COLORS[category ?? "other"] ?? CATEGORY_COLORS.other!;

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ExpenseRow({ e, i, members, myMemberId }: { e: Expense; i: number; members: Map<string, Member>; myMemberId: string | null }) {
  const payerIds = e.payers.map((p) => p.memberId);
  const payer =
    payerIds.length > 1
      ? `${payerIds.length} people`
      : payerIds[0] === myMemberId
        ? "you"
        : (members.get(payerIds[0] ?? "")?.displayName ?? "someone");
  const paid = e.payers.find((p) => p.memberId === myMemberId)?.amountPaise ?? 0;
  const owed = e.shares.find((s) => s.memberId === myMemberId)?.amountPaise ?? 0;
  const net = paid - owed;
  const line = net > 0 ? `you lent ${formatINR(net)}` : net < 0 ? `you owe ${formatINR(-net)}` : paid || owed ? "settled" : "not involved";

  return (
    <motion.div {...listItem(i)} className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0">
      <span
        className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] font-bold text-white"
        style={{ background: tileColor(e.category) }}
        aria-hidden="true"
      >
        {e.description.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-semibold">{e.description}</b>
        <span className="text-[12px] text-muted">
          Paid by {payer} · {when(e.spentAt)}
          {e.fx ? ` · ${formatMoney(e.fx.amount, e.fx.currency)}` : ""}
        </span>
      </div>
      <div className="text-right">
        <b className="block text-[14px] font-semibold">{formatINR(e.amountPaise)}</b>
        <span className={`text-[11px] font-medium ${net > 0 ? "text-pos" : net < 0 ? "text-neg" : "text-muted"}`}>{line}</span>
      </div>
    </motion.div>
  );
}

/**
 * The light sheet on Home. Drag the handle or header: it follows the finger with rubber-banding
 * past either end, then springs (snappy, carrying the release velocity) to collapsed or expanded.
 * A tap on the handle toggles it.
 */
export function RecentSheet({ collapsedY, expandedY, header, children }: { collapsedY: number; expandedY: number; header: ReactNode; children: ReactNode }) {
  const reduce = useReducedMotion();
  const y = useMotionValue(typeof window === "undefined" ? 900 : window.innerHeight);
  const controls = useDragControls();
  const target = useRef<"col" | "exp">("col");
  const entered = useRef(false);

  useEffect(() => {
    if (!collapsedY) return;
    const to = target.current === "col" ? collapsedY : expandedY;
    if (reduce) y.set(to);
    else animate(y, to, entered.current ? snappy : { ...snappy, delay: 0.05 });
    entered.current = true;
  }, [collapsedY, expandedY, reduce, y]);

  const settle = (to: "col" | "exp", velocity = 0) => {
    target.current = to;
    const v = to === "col" ? collapsedY : expandedY;
    if (reduce) y.set(v);
    else animate(y, v, { ...snappy, velocity });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const v = info.velocity.y;
    const moved = Math.abs(info.offset.y);
    if (moved < 4 && Math.abs(v) < 60) return settle(target.current === "col" ? "exp" : "col");
    if (v < -350) return settle("exp", v);
    if (v > 350) return settle("col", v);
    settle(y.get() < (collapsedY + expandedY) / 2 ? "exp" : "col", v);
  };

  const startDrag = (e: React.PointerEvent) => controls.start(e);

  return (
    <motion.section
      aria-label="Recent expenses"
      className="absolute inset-x-0 top-0 z-20 flex flex-col rounded-t-[var(--radius-sheet)] bg-sheet text-ink shadow-[0_-12px_30px_rgba(0,0,0,.35)] will-change-transform"
      style={{ y, height: `calc(100% - ${expandedY}px)` }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: expandedY, bottom: collapsedY }}
      dragElastic={0.3}
      dragMomentum={false}
      onDragEnd={onDragEnd}
    >
      <div onPointerDown={startDrag} className="cursor-grab touch-none active:cursor-grabbing">
        <button
          type="button"
          aria-label="Expand or collapse recent expenses"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              settle(target.current === "col" ? "exp" : "col");
            }
          }}
          className="grid w-full place-items-center pt-2.5 pb-1.5"
        >
          <i className="block h-[5px] w-10 rounded-[3px] bg-grab" />
        </button>
        {header}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(110px+env(safe-area-inset-bottom,0px))]">
        {children}
      </div>
    </motion.section>
  );
}
