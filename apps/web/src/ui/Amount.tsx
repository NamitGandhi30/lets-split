import { inrParts } from "@lets-split/core";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { countUp } from "./motion";

interface AmountProps {
  paise: number;
  /** Sizes for ₹, the rupees and the paise, e.g. the Home hero uses 26 / 56 / 22. */
  size?: { cur: number; whole: number; dec: number };
  className?: string;
  wholeStyle?: CSSProperties;
  /** Hide the sign (labels like "You owe" already carry it). */
  absolute?: boolean;
}

/** ₹**4,280**.50: rupees big and bold, symbol and paise smaller and lighter. */
export function Amount({ paise, size = { cur: 15, whole: 15, dec: 12 }, className = "", wholeStyle, absolute }: AmountProps) {
  const p = inrParts(Math.round(absolute ? Math.abs(paise) : paise));
  return (
    <span className={`inline-flex items-baseline gap-[2px] font-bold leading-[1.05] tracking-[-0.02em] ${className}`}>
      {p.sign && <span style={{ fontSize: size.whole }}>−</span>}
      <span className="font-semibold opacity-80" style={{ fontSize: size.cur }}>
        ₹
      </span>
      <span style={{ fontSize: size.whole, ...wholeStyle }}>{p.whole}</span>
      <span className="font-medium opacity-55" style={{ fontSize: size.dec }}>
        {p.decimal}
      </span>
    </span>
  );
}

/** Springs from the previous value to the new one; jumps straight there with Reduce Motion. */
export function useCountUp(target: number, from = 0): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : from);
  const current = useRef(reduce ? target : from);
  useEffect(() => {
    if (reduce) {
      current.current = target;
      setValue(target);
      return;
    }
    const controls = animate(current.current, target, {
      ...countUp,
      onUpdate: (v) => {
        current.current = v;
        setValue(v);
      },
    });
    return () => controls.stop();
  }, [target, reduce]);
  return value;
}
