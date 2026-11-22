import { isValidVpa } from "@lets-split/core";
import { accentOr } from "../../lib/color";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useGroups, useMe } from "../../api/hooks";
import { useWrite, withKey } from "../../api/mutations";
import { supabase } from "../../lib/supabase";
import { Avatar } from "../../ui/Avatar";
import { DOODLE_KEYS } from "../../ui/doodles.generated";
import { CheckIcon, ChevronIcon } from "../../ui/icons";
import { bouncy, snappy } from "../../ui/motion";
import { PageHeader } from "../../ui/PageHeader";
import { useToast } from "../../ui/Toast";
import { fieldCls, labelCls } from "../trips/TripFormSheet";

export function ProfileScreen() {
  const me = useMe();
  const groups = useGroups();
  const save = useWrite("updateMe");
  const toast = useToast();
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");
  const [noUpi, setNoUpi] = useState(false);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);

  useEffect(() => {
    if (!me.data) return;
    setName(me.data.displayName);
    setUpi(me.data.upiId ?? "");
    setNoUpi(me.data.noUpi);
    setAvatarKey(me.data.avatarKey);
  }, [me.data]);

  const upiTrim = upi.trim().toLowerCase();
  const upiOk = noUpi || upiTrim === "" || isValidVpa(upiTrim);
  const dirty =
    me.data &&
    (name.trim() !== me.data.displayName || (noUpi ? null : upiTrim || null) !== me.data.upiId || noUpi !== me.data.noUpi || avatarKey !== me.data.avatarKey);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !upiOk) return;
    save.mutate(
      withKey({ patch: { displayName: name.trim(), avatarKey, ...(noUpi ? { noUpi: true } : { upiId: upiTrim || null, noUpi: false }) } }),
      { onSuccess: () => toast("Saved"), onError: (err) => toast(err.message) },
    );
  }

  const archived = (groups.data ?? []).filter((g) => g.archivedAt);

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-sheet text-ink">
      <PageHeader title="You" />
      <form onSubmit={submit} className="mx-[18px] mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-card p-4">
          <Avatar seed={me.data?.id ?? "you"} avatarKey={avatarKey ?? "you"} photoUrl={me.data?.avatarUrl} size={52} />
          <div className="min-w-0">
            <b className="block truncate text-[17px] font-semibold">{me.data?.displayName ?? " "}</b>
            <span className="block truncate text-[13px] text-muted">{me.data?.email}</span>
          </div>
        </div>

        <div>
          <span className={labelCls}>AVATAR</span>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Avatar">
            {DOODLE_KEYS.map((k) => (
              <motion.button
                key={k}
                type="button"
                role="radio"
                aria-checked={avatarKey === k}
                aria-label={k}
                whileTap={{ scale: 0.92 }}
                transition={snappy}
                onClick={() => setAvatarKey(k)}
                className={`shrink-0 rounded-full p-0.5 ${avatarKey === k ? "ring-2 ring-ink" : ""}`}
              >
                <Avatar seed={k} avatarKey={k} size={46} />
              </motion.button>
            ))}
          </div>
        </div>

        <label>
          <span className={labelCls}>NAME</span>
          <input className={fieldCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>

        <div>
          <span className={labelCls}>UPI ID</span>
          <AnimatePresence initial={false}>
            {!noUpi && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={snappy} className="overflow-hidden">
                <input
                  className={`${fieldCls} ${upiOk ? "" : "ring-2 ring-neg"}`}
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="yourname@okaxis"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                  aria-invalid={!upiOk}
                />
                <p className={`mt-1.5 px-1 text-[12.5px] ${upiOk ? "text-muted" : "font-medium text-neg"}`}>
                  {upiOk ? "Friends see this when they settle up with you, so they can pay in one tap." : "That doesn't look like a UPI ID. It's like name@bank."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            role="switch"
            aria-checked={noUpi}
            onClick={() => setNoUpi((v) => !v)}
            className="mt-2 flex w-full items-center gap-3 rounded-[16px] bg-card px-4 py-3.5 text-left"
          >
            <motion.span
              animate={{ backgroundColor: noUpi ? "#121316" : "#FFFFFF", borderColor: noUpi ? "#121316" : "#D3D8EA", scale: noUpi ? 1.06 : 1 }}
              transition={bouncy}
              className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-white"
            >
              {noUpi && <CheckIcon width={11} height={11} />}
            </motion.span>
            <span className="flex-1">
              <b className="block text-[14px] font-semibold">I don't have a UPI ID</b>
              <span className="text-[12px] text-muted">Friends will be asked to pay you in cash</span>
            </span>
          </button>
        </div>

        <motion.button
          type="submit"
          whileTap={{ scale: 0.97 }}
          transition={snappy}
          disabled={!dirty || !upiOk || !name.trim()}
          className="h-[52px] rounded-full bg-ink font-semibold text-white disabled:opacity-35"
        >
          Save
        </motion.button>
      </form>

      {archived.length > 0 && (
        <div className="mx-[18px] mt-5">
          <span className={labelCls}>ARCHIVED TRIPS</span>
          <div className="rounded-[var(--radius-card)] bg-card px-4 py-1">
            {archived.map((g) => (
              <Link key={g.id} to={`/trips/${g.id}`} className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0">
                <span className="h-3 w-3 rounded-full" style={{ background: accentOr(g.accent) }} />
                <span className="flex-1 text-[14px] font-semibold">{g.name}</span>
                <ChevronIcon className="text-muted" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={() => supabase.auth.signOut()} className="mx-[18px] mt-5 mb-10 h-[52px] w-[calc(100%-36px)] rounded-full bg-card font-semibold text-neg">
        Sign out
      </button>
    </div>
  );
}
