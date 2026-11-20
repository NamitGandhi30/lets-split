import type { Member } from "../../api/client";
import { firstName } from "../../lib/people";
import { Avatar } from "../../ui/Avatar";
import { useSprings } from "../../ui/useSprings";
import { colorAt, rupees } from "./SplitRing";

const TH = 250; // track height
const MH = 62; // fill never shrinks below the avatar

/**
 * Uneven: one vertical pill per person. Drag a pill and everyone else rebalances so the parts always
 * add up to the exact total (the parent does the largest-remainder maths in `onSet`).
 */
export function UnevenSliders({
  members, colorIndex, values, total, onSet,
}: { members: Member[]; colorIndex: (m: Member) => number; values: number[]; total: number; onSet: (i: number, paise: number) => void }) {
  const shown = useSprings(values, { stiffness: 260, damping: 26, rest: 0.5 });
  const scale = Math.max(1, total);
  const narrow = members.length > 5;

  const setFrom = (i: number, el: HTMLElement, clientY: number) => {
    const r = el.getBoundingClientRect();
    const p01 = Math.max(0, Math.min(1, (r.bottom - clientY - MH / 2) / (r.height - MH)));
    // Snap to whole rupees while dragging; exact paise come from the rebalance.
    onSet(i, Math.round((p01 * scale) / 100) * 100);
  };

  return (
    <div className={`no-scrollbar flex gap-2 overflow-x-auto px-0.5 pt-3.5 pb-2.5 select-none ${narrow ? "" : "justify-between"}`}>
      {members.map((m, i) => {
        const p = Math.max(0, Math.min(1, (shown[i] ?? 0) / scale));
        const r = rupees(shown[i] ?? 0);
        return (
          <div key={m.id} className="flex shrink-0 flex-col items-center gap-2">
            <div
              role="slider"
              tabIndex={0}
              aria-label={`${firstName(m)}'s share`}
              aria-valuemin={0}
              aria-valuemax={total / 100}
              aria-valuenow={Math.round(values[i]! / 100)}
              aria-valuetext={`${r.whole}${r.dec}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setFrom(i, e.currentTarget, e.clientY);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) setFrom(i, e.currentTarget, e.clientY);
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 50000 : 10000;
                if (e.key === "ArrowUp" || e.key === "ArrowRight") onSet(i, Math.min(total, values[i]! + step));
                else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onSet(i, Math.max(0, values[i]! - step));
                else return;
                e.preventDefault();
              }}
              className="relative w-[62px] cursor-ns-resize touch-none overflow-hidden rounded-[31px] bg-[#EDEEF1]"
              style={{ height: TH }}
            >
              <div className="absolute inset-x-0 bottom-0 rounded-[31px]" style={{ height: MH + p * (TH - MH), background: colorAt(colorIndex(m)) }}>
                <span className="absolute top-1.5 left-1/2 -translate-x-1/2 rounded-full shadow-[0_2px_8px_rgba(0,0,0,.15)]">
                  <Avatar seed={m.id} avatarKey={m.avatarKey} size={50} />
                </span>
              </div>
            </div>
            <div className="text-[15px] font-bold tabular-nums">
              {r.whole}
              <small className="text-[10px] opacity-55">{r.dec}</small>
            </div>
            <div className="-mt-1.5 max-w-[62px] truncate text-[12px] text-muted">{firstName(m)}</div>
          </div>
        );
      })}
    </div>
  );
}
