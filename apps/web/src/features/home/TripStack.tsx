import { formatINR } from "@lets-split/core";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Group } from "../../api/client";
import { bouncy } from "../../ui/motion";

export const ACCENTS = ["#F4D23C", "#3FD0B6", "#5C8DFF"] as const;
export const accentOf = (g: Group, i: number) => g.accent ?? ACCENTS[i % ACCENTS.length]!;

function meta(g: Group): string {
  const people = `${g.memberCount} ${g.memberCount === 1 ? "person" : "people"}`;
  if (g.startsOn && g.endsOn) {
    const days = Math.round((Date.parse(g.endsOn) - Date.parse(g.startsOn)) / 86_400_000) + 1;
    return `${people} · ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (g.location) return `${people} · ${g.location}`;
  return people;
}

/**
 * The trip card stack: tap (or Enter) flicks the front card away and the next trip slides forward
 * on the bouncy spring. Calls onChange with the front trip.
 */
export function TripStack({ groups, onChange }: { groups: Group[]; onChange: (g: Group) => void }) {
  const reduce = useReducedMotion();
  const [order, setOrder] = useState(() => groups.map((g) => g.id));
  const [flying, setFlying] = useState<string | null>(null);
  const [landing, setLanding] = useState<string | null>(null);

  // Keep the order in sync when trips are added or removed, keeping the current front card.
  useEffect(() => {
    setOrder((prev) => {
      const ids = groups.map((g) => g.id);
      const kept = prev.filter((id) => ids.includes(id));
      return [...kept, ...ids.filter((id) => !kept.includes(id))];
    });
  }, [groups]);

  const byId = new Map(groups.map((g, i) => [g.id, { g, i }]));
  const front = byId.get(order[0] ?? "")?.g;
  useEffect(() => {
    if (front) onChange(front);
  }, [front?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cycle = () => {
    if (order.length < 2 || flying) return;
    if (reduce) return setOrder((o) => [...o.slice(1), o[0]!]);
    setFlying(order[0]!);
  };

  const visible = order.slice(0, 3);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={order.length > 1 ? `Switch trip. Showing ${front?.name ?? ""}` : (front?.name ?? "Trip")}
      onClick={cycle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          cycle();
        }
      }}
      className="relative h-[78px] w-[min(300px,calc(100%-28px))] cursor-pointer outline-none"
    >
      {visible.map((id, k) => {
        const item = byId.get(id);
        if (!item) return null;
        const { g, i } = item;
        const isFlying = flying === id;
        return (
          <motion.div
            key={id}
            className="absolute inset-0 flex origin-right items-center justify-between rounded-[20px] px-[18px] text-ink"
            style={{ background: accentOf(g, i), zIndex: 3 - k }}
            initial={false}
            animate={
              isFlying
                ? { x: -50, y: -18, rotate: -8, opacity: 0 }
                : { x: k * 14, y: 0, rotate: 0, scale: 1 - k * 0.07, opacity: 1, filter: `brightness(${1 - k * 0.15})` }
            }
            transition={
              isFlying
                ? { duration: 0.3, ease: [0.5, 0, 0.9, 0.5] }
                : landing === id
                  ? { default: { duration: 0 }, opacity: { duration: 0.3 } }
                  : bouncy
            }
            onAnimationComplete={() => {
              if (!isFlying) return;
              setOrder((o) => [...o.slice(1), o[0]!]);
              setLanding(id);
              setFlying(null);
              setTimeout(() => setLanding(null), 350);
            }}
          >
            <div className="min-w-0">
              <b className="block truncate text-[17px] font-bold">{g.name}</b>
              <span className="text-[12px] opacity-70">{meta(g)}</span>
            </div>
            <div className="shrink-0 pl-3 text-right font-semibold leading-tight">
              {formatINR(g.totalSpentPaise, { decimals: "never" })}
              <br />
              <span className="text-[12px] font-normal opacity-70">spent so far</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function EmptyStack() {
  return (
    <div className="flex h-[78px] w-[min(300px,calc(100%-28px))] flex-col justify-center rounded-[20px] border border-dashed border-white/20 px-[18px]">
      <b className="text-[17px] font-bold">No trips yet</b>
      <span className="text-[12px] text-dim">Your trips will stack up here</span>
    </div>
  );
}
