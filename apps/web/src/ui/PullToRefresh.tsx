import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { snappy } from "./motion";

const TRIGGER = 72;

/**
 * Scroll container with pull-to-refresh: at the top, pulling down stretches the page with
 * resistance and a spinner fills in; let go past the line to refresh.
 */
export function PullToRefresh({ onRefresh, children, className = "", tone = "dark" }: { onRefresh: () => Promise<unknown>; children: ReactNode; className?: string; tone?: "dark" | "light" }) {
  const y = useMotionValue(0);
  const scroller = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const progress = useTransform(y, [0, TRIGGER], [0, 1]);
  const rotate = useTransform(y, [0, TRIGGER * 1.6], [0, 300]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (busy || (scroller.current?.scrollTop ?? 1) > 0) return (start.current = null);
    start.current = { y: e.touches[0]!.clientY, active: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const dy = e.touches[0]!.clientY - s.y;
    if (dy <= 0 || (scroller.current?.scrollTop ?? 0) > 0) {
      if (s.active) y.set(0);
      return;
    }
    s.active = true;
    y.set(Math.min(140, dy * 0.45)); // rubber band
  };
  const onTouchEnd = async () => {
    const s = start.current;
    start.current = null;
    if (!s?.active) return;
    if (y.get() >= TRIGGER) {
      setBusy(true);
      animate(y, 56, snappy);
      try {
        await onRefresh();
      } finally {
        setBusy(false);
        animate(y, 0, snappy);
      }
    } else animate(y, 0, snappy);
  };

  const ink = tone === "dark" ? "#121316" : "#F2F3F5";
  return (
    <div className={`relative h-full overflow-hidden ${className}`}>
      <motion.div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+10px)] z-10 flex justify-center" style={{ opacity: progress }}>
        <motion.svg width="26" height="26" viewBox="0 0 26 26" style={{ rotate }} animate={busy ? { rotate: 360 } : undefined} transition={busy ? { repeat: Infinity, duration: 0.8, ease: "linear" } : undefined}>
          <circle cx="13" cy="13" r="10" fill="none" stroke={ink} strokeOpacity="0.15" strokeWidth="3" />
          <motion.circle cx="13" cy="13" r="10" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" style={{ pathLength: progress }} />
        </motion.svg>
      </motion.div>
      <motion.div
        ref={scroller}
        style={{ y }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="no-scrollbar h-full overflow-y-auto overscroll-contain"
      >
        {children}
      </motion.div>
    </div>
  );
}
