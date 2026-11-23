import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CheckIcon } from "../../ui/icons";
import { bouncy, countUp, snappy, tf } from "../../ui/motion";
import { Sheet } from "../../ui/Sheet";

interface DemoTrip {
  name: string;
  color: string;
  meta: string;
  spent: number;
  toast: string;
}

/** Back to front. Tapping the stack sends the front trip to the back. */
const TRIPS: DemoTrip[] = [
  { name: "Jaipur: weekend", color: "var(--color-jaipur)", meta: "4 people · 2 days", spent: 12_960, toast: "Rohan settled ₹2,100" },
  { name: "Manali cousins", color: "var(--color-manali)", meta: "8 people · 5 days", spent: 51_275, toast: "Kabir paid you ₹820" },
  { name: "Goa '26", color: "var(--color-goa)", meta: "6 people · 4 days", spent: 38_420, toast: "Diya paid you ₹1,350" },
];

const PEEK = 30; // how much of each card behind shows
const CARD_H = 104;
const ease = [0.2, 0.9, 0.2, 1] as const;

const rise = (i: number) => ({
  initial: { opacity: 0, transform: tf(0, 18) },
  animate: { opacity: 1, transform: tf() },
  transition: { duration: 0.6, ease, delay: 0.45 + i * 0.08 },
});

function readReturnTo(): string {
  try {
    return sessionStorage.getItem("returnTo") ?? "";
  } catch {
    return "";
  }
}

/** First screen when signed out: the trip-card stack, the promise, and two ways in. */
export function WelcomeScreen() {
  const nav = useNavigate();
  const [order, setOrder] = useState([0, 1, 2]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const fromInvite = readReturnTo().startsWith("/join/");
  const front = TRIPS[order[2]!]!;

  const cycle = () => setOrder((o) => [o[2]!, o[0]!, o[1]!]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-chrome pt-safe text-on-dark">
      {/* Soft glow in the front trip's colour, so the whole screen shifts as the stack cycles. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute top-[6%] left-1/2 h-[340px] w-[340px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[90px]"
        animate={{ backgroundColor: front.color }}
        transition={{ duration: 0.8 }}
      />

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6">
        <button
          type="button"
          onClick={cycle}
          aria-label={`Example trip ${front.name}. Tap to see another`}
          className="relative w-[min(320px,100%)] outline-none"
          style={{ height: PEEK * 2 + CARD_H + 26 }}
        >
          {order.map((tripIndex, k) => {
            const t = TRIPS[tripIndex]!;
            const isFront = k === 2;
            return (
              <motion.div
                key={t.name}
                className="absolute inset-x-0 top-0 rounded-[20px] px-[18px] pt-3 text-left text-ink shadow-[0_10px_30px_rgba(0,0,0,.35)]"
                style={{ background: t.color, height: CARD_H, zIndex: k }}
                initial={{ opacity: 0, transform: tf(0, -80 + k * PEEK, 0.9) }}
                animate={{ opacity: 1, transform: tf(0, k * PEEK, 1 - (2 - k) * 0.04) }}
                transition={{ ...bouncy, delay: 0.08 + k * 0.09 }}
              >
                <div className="flex items-start justify-between">
                  <b className={`block font-bold tracking-[-0.01em] ${isFront ? "text-[20px]" : "text-[13px]"}`} style={{ transition: "font-size .25s" }}>
                    {t.name}
                  </b>
                  {isFront && <Spent key={t.name} value={t.spent} />}
                </div>
                <AnimatePresence>
                  {isFront && (
                    <motion.div
                      key={t.name}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="mt-0.5 flex justify-between text-[12px] font-medium opacity-65"
                    >
                      <span>{t.meta}</span>
                      <span>spent so far</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}

          <AnimatePresence mode="popLayout">
            <motion.div
              key={front.toast}
              className="absolute right-[-10px] z-10 flex items-center gap-2 rounded-full bg-white py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold whitespace-nowrap text-ink shadow-[0_8px_24px_rgba(0,0,0,.35)]"
              style={{ top: PEEK * 2 + CARD_H - 18 }}
              initial={{ opacity: 0, transform: tf(0, 14, 0.7) }}
              animate={{ opacity: 1, transform: tf(0, 0, 1) }}
              exit={{ opacity: 0, transform: tf(0, -8, 0.9) }}
              transition={{ ...bouncy, delay: 0.55 }}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-pos text-white">
                <CheckIcon width={12} height={12} />
              </span>
              {front.toast}
            </motion.div>
          </AnimatePresence>
        </button>
      </div>

      <div className="relative px-6 pb-[calc(28px+env(safe-area-inset-bottom,0px))]">
        <motion.h1 {...rise(0)} className="text-[44px] leading-[1.02] font-bold tracking-[-0.035em]">
          Split trips,
          <br />
          not friendships.
        </motion.h1>
        <motion.p {...rise(1)} className="mt-3.5 max-w-[32ch] text-[15px] leading-[1.45] text-dim">
          Log every rupee with your gang, scan bills, and settle in one tap with UPI. Abroad? Any currency, at today's rate.
        </motion.p>

        <motion.div {...rise(2)} className="mt-8">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={snappy}
            onClick={() => nav("/login/email")}
            className="h-14 w-full rounded-full bg-on-dark text-[16px] font-semibold text-chrome"
          >
            {fromInvite ? "Sign in to join the trip" : "Get started"}
          </motion.button>
          {fromInvite ? (
            <p className="mt-1 flex h-12 items-center justify-center text-[13px] text-dim">Your invite is saved. It opens right after you sign in.</p>
          ) : (
            <button type="button" onClick={() => setInviteOpen(true)} className="mt-1 h-12 w-full text-[15px] font-semibold text-on-dark">
              I have an invite link
            </button>
          )}
        </motion.div>
      </div>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Open an invite" tone="dark">
        <InviteForm
          onOpen={(code) => {
            try {
              sessionStorage.setItem("returnTo", `/join/${code}`);
            } catch {
              /* storage blocked: they'll land on Home and can paste it again there */
            }
            setInviteOpen(false);
            nav("/login/email");
          }}
        />
      </Sheet>
    </div>
  );
}

/** "₹38,420" counting up whenever a trip comes to the front. */
function Spent({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `₹${Math.round(v).toLocaleString("en-IN")}`);
  useEffect(() => {
    const c = animate(mv, value, { ...countUp, delay: 0.25 });
    return () => c.stop();
  }, [mv, value]);
  return <motion.b className="text-[20px] font-bold tracking-[-0.01em] tabular-nums">{text}</motion.b>;
}

export function parseInvite(input: string): string | null {
  const m = /join\/([0-9a-f]{6,32})/i.exec(input) ?? /^([0-9a-f]{12})$/i.exec(input.trim());
  return m ? m[1]!.toLowerCase() : null;
}

function InviteForm({ onOpen }: { onOpen: (code: string) => void }) {
  const [link, setLink] = useState("");
  const [bad, setBad] = useState(false);
  const submit = () => {
    const code = parseInvite(link);
    if (!code) return setBad(true);
    onOpen(code);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="px-1 text-[14px] leading-[1.45] text-dim">Paste the link a friend sent you. You'll sign in with your email, then land straight in their trip.</p>
      <input
        data-autofocus
        value={link}
        onChange={(e) => {
          setLink(e.target.value);
          setBad(false);
        }}
        placeholder="https://…/join/…"
        aria-label="Invite link"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`mt-4 h-14 w-full rounded-[18px] bg-surface px-4 text-[16px] font-medium text-on-dark outline-none placeholder:text-dimmer focus:ring-2 ${bad ? "ring-2 ring-neg" : "ring-1 ring-white/5 focus:ring-cobalt"}`}
      />
      <p role="alert" className="min-h-[24px] px-1 pt-1.5 text-[13px] font-medium text-neg-soft">
        {bad ? "That doesn't look like an invite link." : ""}
      </p>
      <button type="submit" disabled={!link.trim()} className="mt-1 h-14 w-full rounded-full bg-on-dark text-[16px] font-semibold text-chrome disabled:opacity-35">
        Continue
      </button>
    </form>
  );
}
