import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * A row of numbers that each spring toward their target (damped harmonic motion, unit mass),
 * re-rendering every frame while any is moving. With Reduce Motion they jump straight there.
 * Used for the split ring and the Uneven pill sliders, where values depend on each other.
 */
export function useSprings(targets: number[], { stiffness = 210, damping = 19, rest = 0.5 } = {}): number[] {
  const reduce = useReducedMotion();
  const state = useRef<{ x: number; v: number }[]>(targets.map((t) => ({ x: t, v: 0 })));
  const [, force] = useState(0);
  const raf = useRef(0);
  const key = targets.join(",");

  useEffect(() => {
    const s = state.current;
    // Grow or shrink with the list; new entries start from zero so they spring in.
    while (s.length < targets.length) s.push({ x: 0, v: 0 });
    s.length = targets.length;
    if (reduce) {
      targets.forEach((t, i) => (s[i] = { x: t, v: 0 }));
      force((n) => n + 1);
      return;
    }
    let last = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      let moving = false;
      targets.forEach((t, i) => {
        const p = s[i]!;
        // Two half-steps keep the bouncy settings stable at 30fps.
        for (let k = 0; k < 2; k++) {
          const a = -stiffness * (p.x - t) - damping * p.v;
          p.v += a * (dt / 2);
          p.x += p.v * (dt / 2);
        }
        if (Math.abs(p.x - t) > rest || Math.abs(p.v) > rest) moving = true;
        else {
          p.x = t;
          p.v = 0;
        }
      });
      force((n) => n + 1);
      if (moving) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [key, reduce, stiffness, damping, rest]); // eslint-disable-line react-hooks/exhaustive-deps

  return state.current.map((p) => p.x);
}

/** Split an integer total by weights so the parts add up exactly (largest remainder). */
export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const ws = sum > 0 ? sum : w.length;
  const raw = w.map((x) => (total * x) / ws);
  const fl = raw.map(Math.floor);
  let left = total - fl.reduce((a, b) => a + b, 0);
  raw
    .map((r, j) => [r - fl[j]!, j] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, j]) => {
      if (left > 0) {
        fl[j]!++;
        left--;
      }
    });
  return fl;
}
