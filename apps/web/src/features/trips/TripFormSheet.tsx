import { motion } from "motion/react";
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Group } from "../../api/client";
import { useWrite, withKey } from "../../api/mutations";
import { ACCENT_SWATCHES, DEFAULT_ACCENT, inkOn } from "../../lib/color";
import { newId } from "../../lib/uuid";
import { DateField } from "../../ui/DateField";
import { CheckIcon } from "../../ui/icons";
import { bouncy, snappy } from "../../ui/motion";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

export const fieldCls =
  "h-[52px] w-full rounded-[16px] bg-card px-4 text-[16px] font-medium text-ink outline-none ring-1 ring-black/5 placeholder:text-[#A2A7B2] focus:ring-2 focus:ring-cobalt";
export const labelCls = "mb-1.5 block px-1 text-[12px] font-semibold tracking-[0.06em] text-muted";

/** Create a trip, or edit one when `group` is given. */
export function TripFormSheet({ open, onClose, group }: { open: boolean; onClose: () => void; group?: Group }) {
  return (
    <Sheet open={open} onClose={onClose} title={group ? "Edit trip" : "New trip"}>
      <TripForm group={group} onDone={onClose} />
    </Sheet>
  );
}

function TripForm({ group, onDone }: { group?: Group; onDone: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const create = useWrite("createGroup");
  const update = useWrite("updateGroup");
  const [name, setName] = useState(group?.name ?? "");
  const [accent, setAccent] = useState<string>(group?.accent ?? DEFAULT_ACCENT);
  const [location, setLocation] = useState(group?.location ?? "");
  const [startsOn, setStartsOn] = useState(group?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(group?.endsOn ?? "");
  const badDates = Boolean(startsOn && endsOn && endsOn < startsOn);
  const [nudge, setNudge] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const custom = !ACCENT_SWATCHES.some((c) => c.toLowerCase() === accent.toLowerCase());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNudge(true);
      nameRef.current?.focus();
      setTimeout(() => setNudge(false), 900);
      return;
    }
    if (badDates) return;
    if (group) {
      update.mutate(
        withKey({
          groupId: group.id,
          patch: { name: name.trim(), accent, location: location.trim() || null, startsOn: startsOn || null, endsOn: endsOn || null },
        }),
      );
      toast("Trip updated");
      onDone();
      return;
    }
    const id = newId();
    create.mutate(
      withKey({ id, name: name.trim(), accent, type: "trip" as const, location: location.trim() || undefined, startsOn: startsOn || undefined, endsOn: endsOn || undefined }),
      {
        onSuccess: () => {
          onDone();
          nav(`/trips/${id}?invite=1`);
        },
        onError: (err) => toast(err.message),
      },
    );
    if (!navigator.onLine) {
      toast("You're offline. The trip will be created when you're back.");
      onDone();
    }
  }

  const busy = create.isPending && !create.isPaused;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
      <motion.label animate={nudge ? { x: [0, -8, 8, -4, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
        <span className={labelCls}>NAME</span>
        <input
          ref={nameRef}
          data-autofocus={group ? undefined : true}
          className={`${fieldCls} ${nudge ? "ring-2 ring-neg" : ""}`}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Trip name"
        />
      </motion.label>

      <div>
        <span className={labelCls}>COLOUR</span>
        <div className="flex items-center gap-3 rounded-[18px] bg-card px-4 py-3.5 ring-1 ring-black/5">
          <motion.span
            key={accent}
            initial={{ scale: 0.85 }}
            animate={{ scale: 1 }}
            transition={bouncy}
            className="flex h-11 min-w-0 flex-1 items-center truncate rounded-[12px] px-3 text-[14px] font-bold"
            style={{ background: accent, color: inkOn(accent) }}
          >
            {name.trim() || "Your trip"}
          </motion.span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 px-1" role="radiogroup" aria-label="Trip colour">
          {ACCENT_SWATCHES.map((hex) => {
            const on = accent.toLowerCase() === hex.toLowerCase();
            return (
              <motion.button
                key={hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={hex === DEFAULT_ACCENT ? "Black" : hex}
                whileTap={{ scale: 0.88 }}
                transition={snappy}
                onClick={() => setAccent(hex)}
                className={`grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-sheet ${on ? "ring-2 ring-ink" : "ring-1 ring-black/10"}`}
                style={{ background: hex, color: inkOn(hex) }}
              >
                {on && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={bouncy}>
                    <CheckIcon width={14} height={14} />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
          <label
            className={`relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full ring-offset-2 ring-offset-sheet ${custom ? "ring-2 ring-ink" : "ring-1 ring-black/10"}`}
            style={{ background: custom ? accent : "conic-gradient(#ff5a5a, #ffd23c, #3fd0b6, #5c8dff, #c45cff, #ff5a5a)" }}
            title="Pick any colour"
          >
            <span className="sr-only">Pick any colour</span>
            {custom ? (
              <CheckIcon width={14} height={14} style={{ color: inkOn(accent) }} />
            ) : (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[14px] font-bold text-ink">+</span>
            )}
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </div>

      <label>
        <span className={labelCls}>WHERE (OPTIONAL)</span>
        <input className={fieldCls} value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} placeholder="Where to?" />
      </label>

      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          <span className={labelCls}>FROM</span>
          <DateField label="Start date" value={startsOn} onChange={setStartsOn} />
        </div>
        <div className="min-w-0 flex-1">
          <span className={labelCls}>TO</span>
          <DateField label="End date" value={endsOn} min={startsOn || undefined} onChange={setEndsOn} align="right" />
        </div>
      </div>
      {badDates && <p className="-mt-2 px-1 text-[13px] font-medium text-neg">The trip can't end before it starts.</p>}

      <motion.button
        type="submit"
        whileTap={{ scale: 0.97 }}
        transition={snappy}
        disabled={badDates || busy}
        className="mt-1 h-[56px] rounded-full bg-ink text-[15px] font-semibold text-white disabled:opacity-40"
      >
        {group ? "Save changes" : busy ? "Creating…" : "Create trip"}
      </motion.button>
    </form>
  );
}
