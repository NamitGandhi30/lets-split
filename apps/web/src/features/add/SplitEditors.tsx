import type { Member } from "../../api/client";
import { firstName } from "../../lib/people";
import { Avatar } from "../../ui/Avatar";

export type MoreMode = "percent" | "shares" | "adjustment";

export const MORE_MODES: { key: MoreMode; label: string; hint: string }[] = [
  { key: "percent", label: "Percent", hint: "Each person's % of the bill. Must add up to 100." },
  { key: "shares", label: "Shares", hint: "Weights, like 2 for a couple and 1 for everyone else." },
  { key: "adjustment", label: "Adjust", hint: "Split equally, then add or take off a fixed amount for someone." },
];

const numCls = "h-11 w-[96px] rounded-[12px] bg-sheet px-3 text-right text-[16px] font-semibold outline-none focus:ring-2 focus:ring-cobalt";

/** Per-person number inputs for the percent, shares and adjustment splits. */
export function MoreEditor({
  mode, members, values, onChange,
}: { mode: MoreMode; members: Member[]; values: Record<string, string>; onChange: (id: string, v: string) => void }) {
  return (
    <div>
      {members.map((m) => (
        <label key={m.id} className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0">
          <Avatar seed={m.id} avatarKey={m.avatarKey} size={34} />
          <span className="flex-1 truncate text-[14px] font-semibold">{firstName(m)}</span>
          {mode === "adjustment" && <span className="text-[13px] text-muted">±₹</span>}
          <input
            inputMode={mode === "adjustment" ? "text" : "decimal"}
            className={numCls}
            value={values[m.id] ?? ""}
            placeholder={mode === "percent" ? "0" : mode === "shares" ? "1" : "0"}
            onChange={(e) => onChange(m.id, e.target.value.replace(mode === "adjustment" ? /[^\d.-]/g : /[^\d.]/g, ""))}
            aria-label={`${firstName(m)} ${mode}`}
          />
          {mode === "percent" && <span className="w-3 text-[13px] text-muted">%</span>}
        </label>
      ))}
    </div>
  );
}
