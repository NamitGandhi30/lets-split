import { useIsMutating, useIsRestoring } from "@tanstack/react-query";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, type Transition } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigationType, useOutlet } from "react-router";
import { useMe } from "../api/hooks";
import { useChangePings } from "../lib/realtime";
import { useBack } from "../lib/useBack";
import { CloudOffIcon } from "../ui/icons";
import { snappy, tf } from "../ui/motion";
import { TabBar } from "../ui/TabBar";

// Add expense has its own Save button where the tab bar would sit.
const TAB_ROUTES = ["/", "/stats"];
const TAB_INDEX: Record<string, number> = { "/": 0, "/add": 1, "/stats": 2 };
/** Pages that stack on top (push in from the right, swipe from the left edge to go back). */
const isStacked = (p: string) => /^\/(trips|expenses|alerts|me|add|wrapped|join)\b/.test(p);

type Dir = { kind: "push" | "pop" | "tab" | "fade" | "up" | "down"; sign: number };

/**
 * Page push / pop, like UIKit's navigation controller: the new page slides in from the right over
 * the old one, which drifts left and dims; going back reverses it. Critically damped so the page
 * edge never overshoots and flashes the background.
 */
const PAGE: Transition = { type: "spring", stiffness: 320, damping: 36, restDelta: 0.5 };
const variants = {
  initial: (d: Dir) =>
    d.kind === "up" ? { transform: tf(0, "100%"), opacity: 1, zIndex: 2 }
    : d.kind === "down" ? { transform: tf(), opacity: 1, zIndex: 1 }
    : d.kind === "push" ? { transform: tf("100%"), opacity: 1, zIndex: 2 }
    : d.kind === "pop" ? { transform: tf("-28%"), opacity: 0.6, zIndex: 1 }
    : d.kind === "tab" ? { transform: tf(28 * d.sign), opacity: 0, zIndex: 2 }
    : { transform: tf(), opacity: 0, zIndex: 2 },
  animate: { transform: tf(), opacity: 1, transition: { transform: PAGE, opacity: { duration: 0.25 } } },
  exit: (d: Dir) =>
    d.kind === "up" ? { opacity: 0.6, zIndex: 1, transition: { duration: 0.3 } }
    : d.kind === "down" ? { transform: tf(0, "100%"), zIndex: 2, transition: { transform: PAGE } }
    : d.kind === "push" ? { transform: tf("-28%"), opacity: 0.6, zIndex: 1, transition: { transform: PAGE, opacity: { duration: 0.3 } } }
    : d.kind === "pop" ? { transform: tf("100%"), opacity: 1, zIndex: 2, transition: { transform: PAGE } }
    : d.kind === "tab" ? { transform: tf(-28 * d.sign), opacity: 0, zIndex: 1, transition: { duration: 0.18 } }
    : { opacity: 0, zIndex: 1, transition: { duration: 0.15 } },
};

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/** Which way the next screen should move, from where we were and how we got here. */
function useDirection(): Dir {
  const loc = useLocation();
  const navType = useNavigationType();
  const prev = useRef(loc.pathname);
  const memo = useRef<{ key: string; dir: Dir }>({ key: "", dir: { kind: "fade", sign: 1 } });
  if (memo.current.key !== loc.key) {
    const from = prev.current;
    const to = loc.pathname;
    const back = navType === "POP" || (loc.state as { back?: boolean } | null)?.back === true;
    let dir: Dir;
    if (from === to) dir = { kind: "fade", sign: 1 };
    else if (to === "/wrapped") dir = { kind: "up", sign: 1 };
    else if (from === "/wrapped") dir = { kind: "down", sign: -1 };
    else if (to in TAB_INDEX && from in TAB_INDEX && !isStacked(from) && !isStacked(to)) dir = { kind: "tab", sign: Math.sign(TAB_INDEX[to]! - TAB_INDEX[from]!) || 1 };
    else if (back) dir = { kind: "pop", sign: -1 };
    else if (isStacked(to)) dir = { kind: "push", sign: 1 };
    else if (isStacked(from)) dir = { kind: "pop", sign: -1 };
    else dir = { kind: "fade", sign: 1 };
    memo.current = { key: loc.key, dir };
  }
  useEffect(() => {
    prev.current = loc.pathname;
  }, [loc.pathname]);
  return memo.current.dir;
}

/** The base colour behind each screen, so any strip iOS leaves (under the home indicator) matches it. */
function screenBg(p: string): string {
  if (p === "/add" || /^\/expenses\/[^/]+\/edit/.test(p)) return "#EEF1FB";
  if (p === "/wrapped") return "#000000";
  if (/^\/(trips|expenses|alerts|me|stats)(\/|$)/.test(p)) return "#F6F6F7";
  return "#0E0F12";
}

/** Signed-in layout: the stacked screens, the floating tab bar on tab screens, and an offline pill. */
export function AppShell() {
  const loc = useLocation();
  const outlet = useOutlet();
  const online = useOnline();
  const restoring = useIsRestoring();
  const queued = useIsMutating();
  useChangePings(online && !restoring);
  const me = useMe();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const stacked = isStacked(loc.pathname);
  useEffect(() => {
    const bg = screenBg(loc.pathname);
    document.documentElement.style.setProperty("--screen-bg", bg);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  }, [loc.pathname]);

  // First run: name, avatar and UPI before anything else (an invite link resumes afterwards).
  if (me.data && !me.data.onboarded && loc.pathname !== "/welcome") {
    return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }

  return (
    <div className="relative h-full overflow-hidden bg-chrome">
      <AnimatePresence mode="popLayout" initial={false} custom={reduce ? { kind: "fade", sign: 1 } : dir}>
        <motion.main
          key={loc.pathname}
          custom={reduce ? { kind: "fade", sign: 1 } : dir}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="absolute inset-0 shadow-[-10px_0_30px_rgba(0,0,0,.28)]"
          style={{ willChange: "transform" }}
        >
          <EdgeSwipe enabled={stacked && loc.pathname !== "/wrapped" && loc.pathname !== "/welcome"}>{outlet}</EdgeSwipe>
        </motion.main>
      </AnimatePresence>
      {TAB_ROUTES.includes(loc.pathname) && <TabBar />}
      <AnimatePresence>
        {!online && (
          <motion.div
            role="status"
            initial={{ transform: tf("-50%", -40), opacity: 0 }}
            animate={{ transform: tf("-50%", 0), opacity: 1 }}
            exit={{ transform: tf("-50%", -40), opacity: 0 }}
            transition={snappy}
            className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+8px)] left-1/2 z-[55] flex items-center gap-1.5 rounded-full bg-ink/90 px-3 py-1.5 text-[12px] font-semibold text-white ring-1 ring-white/10 backdrop-blur"
          >
            <CloudOffIcon />
            {queued ? `Offline · ${queued} to sync` : "Offline · showing saved data"}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Swipe from the left edge to go back, like iOS: the page follows your finger (the dark chrome
 * shows underneath), and letting go past a third of the screen, or with a quick flick, goes back.
 */
function EdgeSwipe({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const x = useMotionValue(0);
  const goBack = useBack("/");
  const drag = useRef<{ id: number; x0: number; t: number; lx: number; lt: number; v: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    drag.current = { id: e.pointerId, x0: e.clientX, t: performance.now(), lx: e.clientX, lt: performance.now(), v: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const now = performance.now();
    d.v = ((e.clientX - d.lx) / Math.max(1, now - d.lt)) * 1000;
    d.lx = e.clientX;
    d.lt = now;
    x.set(Math.max(0, e.clientX - d.x0));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const w = window.innerWidth;
    if (x.get() > w / 3 || (d.v > 500 && x.get() > 30)) {
      animate(x, w, { ...snappy, velocity: d.v, restDelta: 1 }).then(goBack);
    } else {
      animate(x, 0, { ...snappy, velocity: d.v });
    }
  };

  return (
    <>
      <motion.div className="absolute inset-0" style={{ x }}>
        {children}
      </motion.div>
      {enabled && (
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-0 z-[45] w-5 touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}
    </>
  );
}
