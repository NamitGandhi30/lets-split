import { formatINR } from "@lets-split/core";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Member, WrappedData } from "../../api/client";
import { useGroups, useMembers, useWrapped } from "../../api/hooks";
import { useCurrentTripId } from "../../lib/currentTrip";
import { CATEGORIES } from "../../lib/people";
import { Avatar } from "../../ui/Avatar";
import { useToast } from "../../ui/Toast";

// Trip Wrapped, per the approved prototype: five auto-advancing stories over drifting gradient
// shards, white type, dark glass cards and quirky quotes. Tap right for next, left for back,
// hold to pause.

const DUR = 5200;
const rupees = (p: number) => formatINR(p, { decimals: "never" });
const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const PALETTES: [string, string, string][] = [
  ["#FF2E93", "#E8221B", "#3A0418"],
  ["#F2600C", "#9A2A06", "#1A0700"],
  ["#3D5BFF", "#B44DFF", "#06082A"],
  ["#16A34A", "#0B5D3B", "#021008"],
  ["#00C2FF", "#3FD0B6", "#03161E"],
];

type Personality = NonNullable<WrappedData["me"]>["personality"];
const PERSONA: Record<Personality, { title: string; quote: string }> = {
  "chai-accountant": { title: "The Chai\nAccountant", quote: "Tracked every ₹20 chai. Nobody asked. Everyone's quietly grateful." },
  "big-spender": { title: "The Walking\nATM", quote: "Tapped to pay so often, the card machine started recognising you." },
  "night-owl": { title: "The 2 am\nLogger", quote: "Some people sleep on holiday. You reconcile." },
  foodie: { title: "The Snack\nStrategist", quote: "Every plan somehow routed past a food stall. Coincidence, apparently." },
  "silent-partner": { title: "The Silent\nPartner", quote: "Never logged a thing. Somehow still in every photo." },
  "trip-treasurer": { title: "The Trip\nTreasurer", quote: "Kept the maths honest so the vibes could stay loose." },
};

/** Seeded random so a slide's shards don't jump around on re-render. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function Shards({ pal, seed }: { pal: [string, string, string]; seed: number }) {
  const shards = useMemo(() => {
    const r = rng(seed * 7919 + 1);
    return Array.from({ length: 12 }, (_, i) => ({
      w: 220 + r() * 320,
      h: 140 + r() * 260,
      left: 10 + r() * 60,
      top: 5 + r() * 75,
      deg: r() * 360,
      a: pal[i % 2],
      b: pal[(i + 1) % 2],
      t: 6 + r() * 6,
      x0: -40 + r() * 80,
      y0: -40 + r() * 80,
      x1: -80 + r() * 160,
      y1: -80 + r() * 160,
      r0: -60 + r() * 120,
      r1: -60 + r() * 120,
      delay: -r() * 6,
    }));
  }, [pal, seed]);
  return (
    <div className="absolute inset-[-30%] saturate-[1.15]" style={{ background: pal[2] }}>
      {shards.map((s, i) => (
        <div
          key={i}
          className="wrapped-shard"
          style={
            {
              width: s.w,
              height: s.h,
              left: `${s.left}%`,
              top: `${s.top}%`,
              background: `linear-gradient(${s.deg}deg, ${s.a}, ${s.b} 55%, ${pal[2]})`,
              "--t": `${s.t}s`,
              "--x0": `${s.x0}px`,
              "--y0": `${s.y0}px`,
              "--x1": `${s.x1}px`,
              "--y1": `${s.y1}px`,
              "--r0": `${s.r0}deg`,
              "--r1": `${s.r1}deg`,
              animationDelay: `${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

const shadow = "[text-shadow:0_2px_18px_rgba(0,0,0,.45)]";
const Ey = ({ children }: { children: ReactNode }) => <div className={`text-[12px] font-bold tracking-[0.08em] text-white/75 ${shadow}`}>{children}</div>;
const H2 = ({ children }: { children: ReactNode }) => <h2 className={`m-0 text-[34px] leading-[1.08] font-bold whitespace-pre-line ${shadow}`}>{children}</h2>;
const Big = ({ children, size = 84 }: { children: ReactNode; size?: number }) => (
  <div className={`leading-none font-black tracking-[-0.02em] whitespace-pre-line ${shadow}`} style={{ fontSize: size }}>
    {children}
  </div>
);
const Facts = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((f) => (
      <span key={f} className="rounded-full bg-black/35 px-3.5 py-[9px] text-[14px] font-semibold backdrop-blur-[8px]">
        {f}
      </span>
    ))}
  </div>
);
const Quote = ({ text, small }: { text: string; small: string }) => (
  <div className="rounded-[28px] bg-black/45 p-[22px] backdrop-blur-[10px]">
    <p className="m-0 mb-2 text-[22px] leading-[1.2] font-bold">“{text}”</p>
    <small className="text-[12px] text-white/60">{small}</small>
  </div>
);

function CountUp({ to }: { to: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return setV(to);
    const c = animate(0, to, { type: "spring", stiffness: 60, damping: 16, restDelta: 50, delay: 0.25, onUpdate: setV });
    return () => c.stop();
  }, [to, reduce]);
  return <>{rupees(Math.round(v))}</>;
}

type Item = { node: ReactNode; bottom?: boolean };
const item = (node: ReactNode, bottom = false): Item => ({ node, bottom });

function slides(w: WrappedData, members: Member[], onShare: () => void): Item[][] {
  const first = w.tripName.split(" ")[0] ?? w.tripName;
  const others = Math.max(0, w.people - 1);
  const persona = PERSONA[w.me?.personality ?? "trip-treasurer"];
  const maggi = Math.max(1, Math.round(w.totalPaise / 8000));
  const titleSize = first.length > 9 ? 56 : 76;
  return [
    [
      item(<Ey>YOUR TRIP, WRAPPED</Ey>),
      item(<Big size={titleSize}>{`${first}\nWrapped`}</Big>),
      item(<Facts items={[`${w.days} ${w.days === 1 ? "day" : "days"}`, `${w.people} ${w.people === 1 ? "person" : "people"}`, `${w.expenseCount} expenses`]} />),
      item(
        <div className="flex">
          {members
            .filter((m) => !m.removedAt)
            .slice(0, 8)
            .map((m) => (
              <Avatar key={m.id} seed={m.id} avatarKey={m.avatarKey} size={36} className="-mr-2 border-2 border-white/85" />
            ))}
        </div>,
      ),
      item(<Quote text="Let's see who paid, who owed, and who ordered Maggi at 3 am." small="Tap to start" />, true),
    ],
    [
      item(<Ey>2 OF 5</Ey>),
      item(<H2>{w.people > 1 ? `Together, the ${NUM[w.people] ?? w.people}\nof you spent` : "This trip, you spent"}</H2>),
      item(
        <Big>
          <CountUp to={w.totalPaise} />
        </Big>,
      ),
      item(
        <Facts
          items={[
            `${rupees(w.perDayPaise)} a day`,
            `${rupees(w.perPersonPaise)} each`,
            w.chaiCount ? `${w.chaiCount} ${w.chaiCount === 1 ? "chai" : "chais"} tracked` : `${w.expenseCount} things logged`,
          ]}
        />,
      ),
      item(
        <Quote
          text={`That's ${maggi.toLocaleString("en-IN")} plates of Maggi.${w.biggest ? ` Or one very ambitious ${w.biggest.description.toLowerCase()} habit.` : ""}`}
          small="Let's Split, doing the maths so you don't have to"
        />,
        true,
      ),
    ],
    [
      item(<Ey>3 OF 5</Ey>),
      item(<H2>{"The biggest wallet\non this trip"}</H2>),
      item(<Big size={w.topPayer && w.topPayer.name.length > 8 ? 60 : 84}>{w.topPayer?.name ?? "Nobody yet"}</Big>),
      ...(w.topPayer
        ? [item(<Facts items={[`paid for ${w.topPayer.count} ${w.topPayer.count === 1 ? "thing" : "things"}`, `${rupees(w.topPayer.paidPaise)} up front`, "zero complaints"]} />)]
        : []),
      item(
        <Quote
          text="Card swiped harder than the wind on a mountain pass."
          small={`Thank you for your service, ${w.topPayer?.name === "You" ? "you" : (w.topPayer?.name ?? "everyone")}`}
        />,
        true,
      ),
    ],
    [
      item(<Ey>4 OF 5</Ey>),
      item(<H2>Your trip personality</H2>),
      item(<Big size={54}>{persona.title}</Big>),
      item(
        <Facts
          items={[
            `logged ${w.me?.logged ?? 0} ${w.me?.logged === 1 ? "expense" : "expenses"}`,
            w.me?.smallestLoggedPaise != null ? `smallest: ${rupees(w.me.smallestLoggedPaise)}` : `paid ${rupees(w.me?.paidPaise ?? 0)}`,
          ]}
        />,
      ),
      item(<Quote text={persona.quote} small={others ? `Certified by ${NUM[others] ?? others} ${others === 1 ? "friend" : "friends"}` : "Certified by you, obviously"} />, true),
    ],
    [
      item(<Ey>5 OF 5</Ey>),
      item(<Big size={64}>{rupees(w.totalPaise)}</Big>),
      item(
        <div className={`text-[40px] leading-[1.15] font-extrabold ${shadow}`}>
          {w.categories.slice(0, 4).map((c) => (
            <div key={c.category} className="flex justify-between">
              <span>{CATEGORIES.find((x) => x.key === c.category)?.label ?? c.category}</span>
              <span>{c.percent}%</span>
            </div>
          ))}
        </div>,
      ),
      item(
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={onShare}
          className="h-[54px] w-full rounded-full bg-on-dark font-semibold text-chrome"
        >
          Share to the group chat
        </button>,
        true,
      ),
      item(<div className="text-center text-[13px] text-white/60">Tap anywhere to replay</div>),
    ],
  ];
}

export function WrappedScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const reduce = useReducedMotion();
  const groups = useGroups();
  const currentId = useCurrentTripId();
  const trip = (groups.data ?? []).filter((g) => !g.archivedAt).find((g) => g.id === currentId) ?? groups.data?.find((g) => !g.archivedAt);
  const data = useWrapped(trip?.id);
  const members = useMembers(trip?.id);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const bar = useRef<HTMLElement | null>(null);
  const t0 = useRef(0);
  const elapsed = useRef(0);
  const held = useRef(0);

  const share = useCallback(async () => {
    const w = data.data;
    if (!w) return;
    const top = w.categories.slice(0, 3).map((c) => `${CATEGORIES.find((x) => x.key === c.category)?.label ?? c.category} ${c.percent}%`).join(", ");
    const text = [
      `${w.tripName} Wrapped 🎁`,
      `${w.days} days · ${w.people} people · ${rupees(w.totalPaise)} spent (${rupees(w.perPersonPaise)} each)`,
      w.topPayer ? `Biggest wallet: ${w.topPayer.name} (${rupees(w.topPayer.paidPaise)})` : "",
      top ? `Where it went: ${top}` : "",
      "Made with Let's Split",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied. Paste it in the group chat.");
      }
    } catch {
      /* dismissed */
    }
  }, [data.data, toast]);

  const list = useMemo(() => (data.data ? slides(data.data, members.data ?? [], share) : []), [data.data, members.data, share]);
  const n = list.length || 5;

  const go = useCallback((to: number) => {
    elapsed.current = 0;
    t0.current = performance.now();
    setI(to);
  }, []);

  // Progress bar + auto-advance, driven by one rAF loop; paused while held.
  useEffect(() => {
    if (!data.data || paused) return;
    t0.current = performance.now() - elapsed.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0.current) / DUR);
      elapsed.current = now - t0.current;
      if (bar.current) bar.current.style.width = `${p * 100}%`;
      if (p >= 1) {
        if (i < n - 1) go(i + 1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, paused, data.data, n, go]);

  function onUp(e: React.PointerEvent) {
    setPaused(false);
    if (performance.now() - held.current > 350) return; // that was a hold, not a tap
    const x = e.clientX / window.innerWidth;
    if (i === n - 1 && x >= 0.3) return go(0);
    if (x < 0.3) go(Math.max(0, i - 1));
    else go(Math.min(n - 1, i + 1));
  }

  const pal = PALETTES[i % PALETTES.length]!;
  return (
    <div
      className="relative h-full cursor-pointer touch-none overflow-hidden bg-black text-white select-none"
      onPointerDown={() => {
        held.current = performance.now();
        setPaused(true);
      }}
      onPointerUp={onUp}
      onPointerCancel={() => setPaused(false)}
    >
      <AnimatePresence initial={false}>
        <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
          <Shards pal={pal} seed={i + 1} />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.25)_50%,rgba(0,0,0,.6))]" />

      <div className="absolute inset-x-6 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[5] flex gap-[5px]">
        {Array.from({ length: n }, (_, k) => (
          <i key={k} className="h-1 flex-1 overflow-hidden rounded-[2px] bg-white/30">
            <b ref={k === i ? (el) => void (bar.current = el) : undefined} className="block h-full bg-white" style={{ width: k < i ? "100%" : k > i ? "0%" : undefined }} />
          </i>
        ))}
      </div>
      <button
        type="button"
        aria-label="Close Wrapped"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={() => nav("/stats")}
        className="absolute top-[calc(env(safe-area-inset-top,0px)+26px)] right-[22px] z-[6] grid h-8 w-8 place-items-center rounded-full bg-black/35"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      {!data.data ? (
        <div className="absolute inset-0 grid place-items-center text-[15px] text-white/70">{data.isError ? "Couldn't load Wrapped." : "Wrapping your trip…"}</div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={i}
            className="absolute inset-0 z-[4] flex flex-col gap-3.5 px-6 pt-[calc(env(safe-area-inset-top,0px)+62px)] pb-[calc(env(safe-area-inset-bottom,0px)+30px)]"
            initial="hidden"
            animate="in"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            variants={{ in: { transition: { staggerChildren: reduce ? 0 : 0.1 } } }}
          >
            {(list[i] ?? []).map((x, k) => (
              <motion.div
                key={k}
                className={x.bottom ? "mt-auto" : undefined}
                variants={{ hidden: { opacity: 0, y: 22 }, in: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.2, 0.9, 0.2, 1] } } }}
              >
                {x.node}
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
