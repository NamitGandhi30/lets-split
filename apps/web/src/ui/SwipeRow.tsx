import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useRef, type ReactNode } from "react";
import { snappy } from "./motion";

const OPEN = -88;

/**
 * Swipe a row left to reveal Delete (like Mail). A long swipe deletes straight away. Taps on the
 * row still work; a drag never counts as a tap.
 */
export function SwipeRow({ children, onDelete, label = "Delete" }: { children: ReactNode; onDelete: () => void; label?: string }) {
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const width = useRef(320);
  const reveal = useTransform(x, [OPEN, 0], [1, 0]);
  const scale = useTransform(x, [OPEN, 0], [1, 0.6]);

  const close = () => animate(x, 0, snappy);
  const commit = () => {
    animate(x, -width.current, { ...snappy, restDelta: 1 }).then(onDelete);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const v = info.velocity.x;
    const cur = x.get();
    if (cur < -width.current * 0.55 || (v < -900 && cur < OPEN)) return commit();
    if (cur < OPEN / 2 || v < -400) animate(x, OPEN, { ...snappy, velocity: v });
    else animate(x, 0, { ...snappy, velocity: v });
  };

  return (
    <div
      className="relative overflow-hidden"
      ref={(el) => {
        if (el) width.current = el.offsetWidth;
      }}
    >
      <motion.button
        type="button"
        onClick={commit}
        style={{ opacity: reveal }}
        className="absolute inset-y-1 right-0 flex w-[80px] items-center justify-center rounded-[14px] bg-neg text-[13px] font-semibold text-white"
        aria-label={label}
      >
        <motion.span style={{ scale }}>{label}</motion.span>
      </motion.button>
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -10000, right: 0 }}
        dragElastic={{ left: 0.9, right: 0.05 }}
        dragMomentum={false}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
        onClickCapture={(e) => {
          // A swipe ends in a click on the row underneath; swallow it, and close an open row on tap.
          if (dragged.current) {
            e.preventDefault();
            e.stopPropagation();
            dragged.current = false;
          } else if (x.get() < -4) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        className="relative bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}
