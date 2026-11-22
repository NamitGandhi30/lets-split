import { isValidVpa } from "@lets-split/core";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMe } from "../../api/hooks";
import { useWrite, withKey } from "../../api/mutations";
import { Avatar } from "../../ui/Avatar";
import { DOODLE_KEYS } from "../../ui/doodles.generated";
import { BackIcon, CheckIcon } from "../../ui/icons";
import { bouncy, snappy } from "../../ui/motion";
import { useToast } from "../../ui/Toast";
import { TripFormSheet } from "../trips/TripFormSheet";

const darkField =
  "h-[56px] w-full rounded-[18px] bg-surface px-4 text-[17px] font-medium text-on-dark outline-none ring-1 ring-white/5 placeholder:text-dimmer focus:ring-2 focus:ring-cobalt";

/**
 * First run, three short steps: your name and doodle, how friends pay you (UPI), then start a trip
 * or open an invite. Arriving from an invite link skips the last step and goes straight to it.
 */
export function OnboardingScreen() {
  const me = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const next = params.get("next");
  const fromInvite = Boolean(next?.startsWith("/join/"));
  const save = useWrite("updateMe");

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>("you");
  const [upi, setUpi] = useState("");
  const [noUpi, setNoUpi] = useState(false);
  const [newTrip, setNewTrip] = useState(false);
  const [link, setLink] = useState("");

  useEffect(() => {
    if (!me.data) return;
    setName((n) => n || me.data.displayName);
    setAvatar((a) => me.data.avatarKey ?? a);
    setUpi((u) => u || (me.data.upiId ?? ""));
  }, [me.data]);

  const upiTrim = upi.trim().toLowerCase();
  const upiOk = noUpi || isValidVpa(upiTrim);
  const go = (s: number) => {
    setDir(s > step ? 1 : -1);
    setStep(s);
  };

  function finishProfile() {
    save.mutate(
      withKey({
        patch: { displayName: name.trim(), avatarKey: avatar, onboarded: true as const, ...(noUpi ? { noUpi: true } : { upiId: upiTrim, noUpi: false }) },
      }),
      { onError: (e) => toast(e.message) },
    );
    if (fromInvite && next) nav(next, { replace: true });
    else go(2);
  }

  function openLink() {
    const m = /join\/([0-9a-f]{6,32})/i.exec(link) ?? /^([0-9a-f]{12})$/i.exec(link.trim());
    if (!m) return toast("Paste the invite link a friend sent you");
    nav(`/join/${m[1]!.toLowerCase()}`, { replace: true });
  }

  const steps = fromInvite ? 2 : 3;
  return (
    <div className="flex h-full flex-col bg-chrome pt-safe text-on-dark">
      <div className="flex items-center gap-3 px-5 pt-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => go(step - 1)}
          className={`grid h-10 w-10 place-items-center rounded-full bg-surface transition-opacity ${step === 0 ? "pointer-events-none opacity-0" : ""}`}
        >
          <BackIcon />
        </button>
        <div className="flex flex-1 justify-center gap-1.5" aria-label={`Step ${step + 1} of ${steps}`}>
          {Array.from({ length: steps }, (_, i) => (
            <motion.i key={i} className="block h-1.5 rounded-full bg-on-dark" animate={{ width: i === step ? 22 : 6, opacity: i <= step ? 1 : 0.25 }} transition={snappy} />
          ))}
        </div>
        <span className="w-10" />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={snappy}
            className="no-scrollbar absolute inset-0 overflow-y-auto px-6 pt-8 pb-6"
          >
            {step === 0 && (
              <>
                <h1 className="text-[32px] leading-[1.08] font-extrabold tracking-[-0.02em]">Hey! What should friends call you?</h1>
                <div className="mt-7 flex justify-center">
                  <motion.span key={avatar} initial={{ scale: 0.7, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={bouncy} className="rounded-full ring-4 ring-white/10">
                    <Avatar seed={avatar} avatarKey={avatar} size={104} />
                  </motion.span>
                </div>
                <div className="no-scrollbar -mx-6 mt-5 flex gap-2.5 overflow-x-auto px-6 pb-1" role="radiogroup" aria-label="Pick a doodle">
                  {DOODLE_KEYS.map((k) => (
                    <motion.button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={avatar === k}
                      aria-label={k}
                      whileTap={{ scale: 0.9 }}
                      transition={snappy}
                      onClick={() => setAvatar(k)}
                      className={`shrink-0 rounded-full p-[3px] transition-shadow ${avatar === k ? "ring-2 ring-on-dark" : ""}`}
                    >
                      <Avatar seed={k} avatarKey={k} size={50} />
                    </motion.button>
                  ))}
                </div>
                <input
                  className={`${darkField} mt-6`}
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  autoComplete="given-name"
                />
                <p className="mt-2 px-1 text-[13px] text-dim">This is how you show up on bills and in alerts.</p>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="text-[32px] leading-[1.08] font-extrabold tracking-[-0.02em]">How do friends pay you back?</h1>
                <p className="mt-3 text-[15px] leading-[1.45] text-dim">Add your UPI ID and settling up becomes one tap in GPay, PhonePe or Paytm.</p>
                <AnimatePresence initial={false}>
                  {!noUpi && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={snappy} className="overflow-hidden">
                      <input
                        className={`${darkField} mt-6 ${upiTrim && !upiOk ? "ring-2 ring-neg" : ""}`}
                        value={upi}
                        onChange={(e) => setUpi(e.target.value)}
                        placeholder="yourname@okaxis"
                        aria-label="UPI ID"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="email"
                      />
                      {upiTrim && !upiOk && <p className="mt-2 px-1 text-[13px] font-medium text-neg-soft">That doesn't look like a UPI ID. It's like name@bank.</p>}
                    </motion.div>
                  )}
                </AnimatePresence>
                <button type="button" role="switch" aria-checked={noUpi} onClick={() => setNoUpi((v) => !v)} className="mt-3 flex w-full items-center gap-3 rounded-[18px] bg-surface px-4 py-4 text-left">
                  <motion.span
                    animate={{ backgroundColor: noUpi ? "#F2F3F5" : "rgba(0,0,0,0)", scale: noUpi ? 1.06 : 1 }}
                    transition={bouncy}
                    className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-white/30 text-chrome"
                  >
                    {noUpi && <CheckIcon width={11} height={11} />}
                  </motion.span>
                  <span>
                    <b className="block text-[15px] font-semibold">I don't have a UPI ID</b>
                    <span className="text-[12.5px] text-dim">Friends will settle with you in cash</span>
                  </span>
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="text-[32px] leading-[1.08] font-extrabold tracking-[-0.02em]">Where are you headed?</h1>
                <p className="mt-3 text-[15px] leading-[1.45] text-dim">Start a trip and invite your crew, or open an invite a friend sent you.</p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={snappy}
                  onClick={() => setNewTrip(true)}
                  className="mt-7 flex w-full items-center justify-between rounded-[22px] bg-goa px-5 py-5 text-left text-ink"
                >
                  <span>
                    <b className="block text-[19px] font-bold">Start a trip</b>
                    <span className="text-[13px] opacity-70">Goa, Manali, a weekend away…</span>
                  </span>
                  <span className="text-[26px]">→</span>
                </motion.button>
                <div className="mt-3 rounded-[22px] bg-surface p-4">
                  <b className="block text-[15px] font-semibold">Got an invite link?</b>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="h-12 min-w-0 flex-1 rounded-full bg-raised px-4 text-[15px] text-on-dark outline-none placeholder:text-dimmer focus:ring-2 focus:ring-cobalt"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="Paste it here"
                      aria-label="Invite link"
                    />
                    <button type="button" onClick={openLink} disabled={!link.trim()} className="h-12 rounded-full bg-on-dark px-5 font-semibold text-chrome disabled:opacity-30">
                      Open
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-6 pt-2 pb-[calc(20px+env(safe-area-inset-bottom,0px))]">
        {step === 0 && (
          <PrimaryButton disabled={!name.trim()} onClick={() => go(1)}>
            Continue
          </PrimaryButton>
        )}
        {step === 1 && (
          <PrimaryButton disabled={!upiOk || save.isPending} onClick={finishProfile}>
            {fromInvite ? "Continue to the trip" : "Continue"}
          </PrimaryButton>
        )}
        {step === 2 && (
          <button type="button" onClick={() => nav("/", { replace: true })} className="h-12 w-full text-[14px] font-semibold text-dim">
            I'll do this later
          </button>
        )}
      </div>
      <TripFormSheet open={newTrip} onClose={() => setNewTrip(false)} />
    </div>
  );
}

function PrimaryButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={snappy}
      disabled={disabled}
      onClick={onClick}
      className="h-14 w-full rounded-full bg-on-dark text-[16px] font-semibold text-chrome transition-opacity disabled:opacity-35"
    >
      {children}
    </motion.button>
  );
}
