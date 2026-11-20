import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Group } from "../../api/client";
import { useWrite, withKey } from "../../api/mutations";
import { ACCENT_CHOICES } from "../../lib/people";
import { newId } from "../../lib/uuid";
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
  const [accent, setAccent] = useState<string>(group?.accent ?? ACCENT_CHOICES[0].hex);
  const [location, setLocation] = useState(group?.location ?? "");
  const [startsOn, setStartsOn] = useState(group?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(group?.endsOn ?? "");
  const badDates = Boolean(startsOn && endsOn && endsOn < startsOn);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || badDates) return;
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
      <label>
        <span className={labelCls}>NAME</span>
        <input autoFocus={!group} className={fieldCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Goa '26" />
      </label>

      <div>
        <span className={labelCls}>COLOUR</span>
        <div className="flex gap-2.5" role="radiogroup" aria-label="Trip colour">
          {ACCENT_CHOICES.map((a) => {
            const on = accent === a.hex;
            return (
              <motion.button
                key={a.hex}
                type="button"
                role="radio"
                aria-checked={on}
                whileTap={{ scale: 0.94 }}
                transition={snappy}
                onClick={() => setAccent(a.hex)}
                className={`relative flex h-[64px] flex-1 flex-col justify-end rounded-[18px] px-3 pb-2 text-left text-[13px] font-bold text-ink ring-offset-2 ring-offset-sheet ${on ? "ring-2 ring-ink" : ""}`}
                style={{ background: a.hex }}
              >
                {a.name}
                {on && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={bouncy} className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-ink text-white">
                    <CheckIcon width={11} height={11} />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      <label>
        <span className={labelCls}>WHERE</span>
        <input className={fieldCls} value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} placeholder="North Goa" />
      </label>

      <div className="flex gap-2.5">
        <label className="flex-1">
          <span className={labelCls}>FROM</span>
          <input type="date" className={fieldCls} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="flex-1">
          <span className={labelCls}>TO</span>
          <input type="date" className={fieldCls} value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
      </div>
      {badDates && <p className="-mt-2 px-1 text-[13px] font-medium text-neg">The trip can't end before it starts.</p>}

      <motion.button
        type="submit"
        whileTap={{ scale: 0.97 }}
        transition={snappy}
        disabled={!name.trim() || badDates || busy}
        className="mt-1 h-[56px] rounded-full bg-ink text-[15px] font-semibold text-white disabled:opacity-40"
      >
        {group ? "Save changes" : busy ? "Creating…" : "Create trip"}
      </motion.button>
    </form>
  );
}
