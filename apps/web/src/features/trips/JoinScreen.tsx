import { motion } from "motion/react";
import { accentOr, inkOn } from "../../lib/color";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { useInvite } from "../../api/hooks";
import { useWrite, withKey } from "../../api/mutations";
import { Avatar } from "../../ui/Avatar";
import { confetti } from "../../ui/confetti";
import { CheckIcon } from "../../ui/icons";
import { bouncy, listItem, snappy } from "../../ui/motion";
import { useToast } from "../../ui/Toast";

/** /join/:code: see the trip, say which placeholder is you (or that you're new), and join. */
export function JoinScreen() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const invite = useInvite(code.toLowerCase());
  const join = useWrite("join");
  const [pick, setPick] = useState<string | "new" | null>(null);

  const p = invite.data;
  const placeholders = p?.members.filter((m) => m.isPlaceholder) ?? [];
  const joined = p?.members.filter((m) => !m.isPlaceholder) ?? [];
  const choice = placeholders.length ? pick : "new";

  function go() {
    if (!p || !choice) return;
    join.mutate(withKey({ code: code.toLowerCase(), claimMemberId: choice === "new" ? undefined : choice }), {
      onSuccess: () => {
        confetti();
        nav(`/trips/${p.groupId}`, { replace: true });
      },
      onError: (e) => toast(e instanceof ApiError && e.code === "ALREADY_CLAIMED" ? "Someone just claimed that spot. Pick another." : e.message),
    });
  }

  if (invite.isError) {
    return (
      <div className="grid h-full place-items-center bg-chrome px-8 text-center">
        <div>
          <p className="text-[22px] font-bold">This invite doesn't work</p>
          <p className="mt-2 text-[14px] leading-[1.5] text-dim">It may have been reset. Ask whoever sent it for a fresh link.</p>
          <Link to="/" className="mt-6 inline-flex h-12 items-center rounded-full bg-on-dark px-6 font-semibold text-chrome">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-chrome pt-safe text-on-dark">
      <div className="px-6 pt-10">
        <p className="text-[14px] text-dim">You're invited to</p>
        {p ? (
          <motion.div
            initial={{ transform: "translate3d(0px, 30px, 0px) rotate(-4deg)", opacity: 0 }}
            animate={{ transform: "translate3d(0px, 0px, 0px) rotate(0deg)", opacity: 1 }}
            transition={bouncy}
            className="mt-3 rounded-[24px] px-5 pt-5 pb-4 ring-1 ring-white/10"
            style={{ background: accentOr(p.accent), color: inkOn(p.accent) }}
          >
            <b className="block text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">{p.name}</b>
            <span className="mt-1 block text-[13px] opacity-75">
              {[p.location, p.startsOn && new Date(p.startsOn).toLocaleDateString("en-IN", { day: "numeric", month: "short" })].filter(Boolean).join(" · ") ||
                `${p.members.length} people`}
            </span>
            <div className="mt-4 flex">
              {p.members.slice(0, 7).map((m) => (
                <Avatar key={m.id} seed={m.id} avatarKey={m.avatarKey} size={34} className="-mr-2 border-2 border-white" />
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="mt-3 h-[150px] animate-pulse rounded-[24px] bg-surface" />
        )}
      </div>

      {p?.alreadyMember ? (
        <div className="px-6 pt-8">
          <p className="text-[15px] text-dim">You're already in this trip.</p>
          <Link to={`/trips/${p.groupId}`} className="mt-4 flex h-14 items-center justify-center rounded-full bg-on-dark font-semibold text-chrome">
            Open {p.name}
          </Link>
        </div>
      ) : p ? (
        <div className="px-6 pt-7 pb-10">
          {placeholders.length > 0 && (
            <>
              <h2 className="text-[17px] font-semibold">Which one are you?</h2>
              <p className="mt-1 text-[13px] text-dim">Pick your name and everything already split with you comes along.</p>
              <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] bg-surface">
                {[...placeholders.map((m) => ({ id: m.id, label: m.displayName, avatarKey: m.avatarKey })), { id: "new", label: "I'm not on the list", avatarKey: null }].map(
                  (o, i) => {
                    const on = pick === o.id;
                    return (
                      <motion.button
                        key={o.id}
                        type="button"
                        {...listItem(i)}
                        onClick={() => setPick(o.id)}
                        className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left last:border-b-0"
                        aria-pressed={on}
                      >
                        {o.id === "new" ? (
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-raised text-[18px] text-dim">+</span>
                        ) : (
                          <Avatar seed={o.id} avatarKey={o.avatarKey} size={36} />
                        )}
                        <span className="flex-1 text-[15px] font-semibold">{o.label}</span>
                        <motion.span
                          animate={{ scale: on ? 1.06 : 1, backgroundColor: on ? "#F2F3F5" : "rgba(0,0,0,0)" }}
                          transition={bouncy}
                          className="grid h-6 w-6 place-items-center rounded-full border-2 border-white/25 text-chrome"
                        >
                          {on && <CheckIcon width={12} height={12} />}
                        </motion.span>
                      </motion.button>
                    );
                  },
                )}
              </div>
            </>
          )}
          {joined.length > 0 && (
            <p className="mt-4 text-[13px] text-dim">
              Already in: {joined.map((m) => m.displayName).join(", ")}
            </p>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={snappy}
            disabled={!choice || join.isPending}
            onClick={go}
            className="mt-6 h-14 w-full rounded-full bg-on-dark text-[15px] font-semibold text-chrome disabled:opacity-40"
          >
            {join.isPending ? "Joining…" : choice && choice !== "new" ? `Join as ${placeholders.find((m) => m.id === choice)?.displayName}` : `Join ${p.name}`}
          </motion.button>
        </div>
      ) : null}
    </div>
  );
}
