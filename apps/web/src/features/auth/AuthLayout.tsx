import { motion } from "motion/react";
import type { ReactNode } from "react";
import { snappy } from "../../ui/motion";

/** The split-ring mark from the app icon. */
export function Mark({ size = 36 }: { size?: number }) {
  const arc = (a0: number, a1: number) => {
    const p = (d: number) => {
      const a = ((d - 90) * Math.PI) / 180;
      return `${(50 + 30 * Math.cos(a)).toFixed(2)} ${(50 + 30 * Math.sin(a)).toFixed(2)}`;
    };
    return `M${p(a0)} A30 30 0 0 1 ${p(a1)}`;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" strokeWidth="13" strokeLinecap="round">
        <path d={arc(18, 102)} stroke="var(--color-goa)" />
        <path d={arc(138, 222)} stroke="var(--color-manali)" />
        <path d={arc(258, 342)} stroke="var(--color-jaipur)" />
      </g>
      <circle cx="50" cy="50" r="6.5" fill="var(--color-on-dark)" />
    </svg>
  );
}

const rise = (i: number) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.2, 0.9, 0.2, 1] as const, delay: 0.05 + i * 0.08 },
});

/** Dark hero on top, light sheet rising from the bottom, the same two-layer look as Home. */
export function AuthLayout({ eyebrow, title, sub, children }: { eyebrow: ReactNode; title: ReactNode; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col bg-chrome pt-safe">
      <div className="flex flex-1 flex-col px-6 pt-8 pb-8">
        <motion.div {...rise(0)} className="flex items-center gap-2.5">
          <Mark size={34} />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">Let's Split</span>
        </motion.div>
        <div className="mt-auto pt-14">
          <motion.p {...rise(1)} className="text-[12px] font-bold tracking-[0.08em] text-dim uppercase">
            {eyebrow}
          </motion.p>
          <motion.h1 {...rise(2)} className="mt-2 text-[38px] leading-[1.06] font-bold tracking-[-0.025em] text-balance">
            {title}
          </motion.h1>
          <motion.p {...rise(3)} className="mt-3 max-w-[30ch] text-[15px] leading-[1.45] text-dim">
            {sub}
          </motion.p>
        </div>
      </div>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...snappy, delay: 0.15 }}
        className="rounded-t-[var(--radius-sheet)] bg-sheet px-5 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] text-ink shadow-[0_-12px_30px_rgba(0,0,0,.35)]"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function Cta({ children, disabled, busy, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={snappy}
      disabled={disabled || busy}
      className="relative h-14 w-full rounded-full bg-ink text-[15px] font-semibold text-white transition-opacity disabled:opacity-40"
      {...(rest as object)}
    >
      <span className={busy ? "opacity-0" : ""}>{children}</span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center" aria-label="Working">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </span>
      )}
    </motion.button>
  );
}
