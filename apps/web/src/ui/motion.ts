import type { Transition } from "motion/react";

/** The two springs from the motion language. Everything that moves uses one of these. */
export const snappy = { type: "spring", stiffness: 320, damping: 30 } as const satisfies Transition;
export const bouncy = { type: "spring", stiffness: 170, damping: 13 } as const satisfies Transition;

/** Count-ups for balances (the prototype's slower, settling spring). */
export const countUp = { type: "spring", stiffness: 110, damping: 22, restDelta: 0.5 } as const satisfies Transition;

/** Staggered list entrance: 60ms apart, soft ease-out, 14px rise. */
export const listItem = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.2, 0.9, 0.2, 1] as const, delay: i * 0.06 },
});
