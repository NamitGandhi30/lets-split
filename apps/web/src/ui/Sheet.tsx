import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { snappy } from "./motion";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Light sheet (default) or the dark chrome surface. */
  tone?: "light" | "dark";
}

/**
 * Modal bottom sheet. Springs up on the snappy spring; drag the handle down to dismiss (a quick
 * flick or past a third of its height), otherwise it springs back. Escape and the scrim close it.
 */
export function Sheet({ open, onClose, title, children, tone = "light" }: SheetProps) {
  return createPortal(
    <AnimatePresence>{open && <SheetBody key="sheet" onClose={onClose} title={title} tone={tone}>{children}</SheetBody>}</AnimatePresence>,
    document.body,
  );
}

function SheetBody({ onClose, title, children, tone }: Omit<SheetProps, "open">) {
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const controls = useDragControls();
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useTransform(y, [0, 400], [1, 0]);
  const labelId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    // Keep an autofocused field's focus; otherwise move focus into the dialog.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const h = panel.current?.offsetHeight ?? 500;
    if (info.velocity.y > 500 || y.get() > h / 3) onClose();
    else animate(y, 0, { ...snappy, velocity: info.velocity.y });
  };

  const light = tone === "light";
  return (
    <div className="fixed inset-0 z-50">
      <motion.div
        className="absolute inset-0 bg-black/55"
        style={{ opacity: scrim }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[92%] max-w-[520px] flex-col rounded-t-[var(--radius-sheet)] outline-none shadow-[0_-12px_40px_rgba(0,0,0,.4)] ${
          light ? "bg-sheet text-ink" : "bg-surface text-on-dark"
        }`}
        style={{ y }}
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: "100%" }}
        transition={snappy}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 1 }}
        onDragEnd={onDragEnd}
      >
        <div onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none pt-2.5 pb-1 active:cursor-grabbing">
          <i className={`mx-auto block h-[5px] w-10 rounded-[3px] ${light ? "bg-grab" : "bg-white/20"}`} />
          {title && (
            <h2 id={labelId} className="px-[22px] pt-3 pb-1 text-[20px] font-bold tracking-[-0.01em]">
              {title}
            </h2>
          )}
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pt-2 pb-[calc(22px+env(safe-area-inset-bottom,0px))]">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
