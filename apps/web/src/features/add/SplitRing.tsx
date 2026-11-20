import { inrParts } from "@lets-split/core";
import type { Member } from "../../api/client";
import { Avatar } from "../../ui/Avatar";
import { useSprings } from "../../ui/useSprings";

export const PERSON_COLORS = ["#141518", "#3D5BFF", "#F4E22C", "#A9B8FF", "#3FD0B6", "#FF8A5B", "#E2557A", "#8E5BD9", "#2F6B4F", "#C9A227"];
export const colorAt = (i: number) => PERSON_COLORS[i % PERSON_COLORS.length]!;

const polar = (r: number, d: number): [number, number] => {
  const a = ((d - 90) * Math.PI) / 180;
  return [110 + r * Math.cos(a), 110 + r * Math.sin(a)];
};
const arc = (a0: number, a1: number) => {
  const [x0, y0] = polar(84, a0);
  const [x1, y1] = polar(84, a1);
  return `M${x0} ${y0} A84 84 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

/**
 * The Equal split ring: one arc per person in their colour, with their avatar pinned to the arc's
 * end. Shares spring to their new size whenever someone is added or removed.
 */
export function SplitRing({ members, shares, center, sub }: { members: Member[]; shares: number[]; center: string; sub: string }) {
  const s = useSprings(shares.map((x) => x * 1000), { stiffness: 210, damping: 19, rest: 0.4 }).map((x) => Math.max(0, Math.min(1, x / 1000)));
  let acc = 0;
  const parts = members.map((m, i) => {
    const sw = s[i]! * 360;
    const gw = Math.max(0, Math.min(1, s[i]! * 8));
    const gap = members.length > 1 ? 30 * gw : 0;
    const a0 = acc + gap / 2;
    const a1 = acc + sw - gap / 2;
    acc += sw;
    const [px, py] = polar(84, Math.max(a0, a1));
    return { m, i, d: a1 - a0 > 0.3 && s[i]! > 0.003 ? (sw >= 359.9 ? null : arc(a0, a1)) : "", full: sw >= 359.9, gw, px, py };
  });
  return (
    <div className="relative grid h-[200px] place-items-center">
      <svg viewBox="0 0 220 220" className="h-[190px] w-[190px] overflow-visible" aria-hidden="true">
        <circle cx="110" cy="110" r="84" fill="none" stroke="#F1F3FA" strokeWidth="24" />
        {parts.map((p) =>
          p.full ? (
            <circle key={p.m.id} cx="110" cy="110" r="84" fill="none" stroke={colorAt(p.i)} strokeWidth="24" />
          ) : p.d ? (
            <path key={p.m.id} d={p.d} fill="none" stroke={colorAt(p.i)} strokeWidth="24" strokeLinecap="round" />
          ) : null,
        )}
      </svg>
      {parts.map((p) => (
        <span
          key={p.m.id}
          className="pointer-events-none absolute top-1/2 left-1/2 block rounded-full bg-white p-[3px]"
          style={{
            transform: `translate(${((p.px - 110) * 190) / 220 - 19}px, ${((p.py - 110) * 190) / 220 - 19}px) scale(${p.gw})`,
            opacity: p.gw,
          }}
        >
          <Avatar seed={p.m.id} avatarKey={p.m.avatarKey} size={32} className="ring-[1.2px] ring-[#1A1A1A]" />
        </span>
      ))}
      <div className="pointer-events-none absolute text-center">
        <b className="block text-[30px] font-bold tracking-[-0.02em]">{center}</b>
        <span className="text-[11px] text-[#6A6F82]">{sub}</span>
      </div>
    </div>
  );
}

export const rupees = (p: number) => {
  const x = inrParts(Math.round(p));
  return { whole: `${x.sign ? "−" : ""}₹${x.whole}`, dec: x.decimal };
};
