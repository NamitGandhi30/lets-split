import { useIsMutating, useIsRestoring } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useOutlet } from "react-router";
import { useMe } from "../api/hooks";
import { useChangePings } from "../lib/realtime";
import { CloudOffIcon } from "../ui/icons";
import { snappy } from "../ui/motion";
import { TabBar } from "../ui/TabBar";

// Add expense has its own Save button where the tab bar would sit.
const TAB_ROUTES = ["/", "/stats"];
const isPage = (p: string) => /^\/(trips|expenses|alerts|me)\b/.test(p);

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

/** Signed-in layout: the current screen, the floating tab bar on tab screens, and an offline pill. */
export function AppShell() {
  const loc = useLocation();
  const outlet = useOutlet();
  const online = useOnline();
  const restoring = useIsRestoring();
  const queued = useIsMutating();
  useChangePings(online && !restoring);
  const me = useMe();
  const page = isPage(loc.pathname);

  // First run: name, avatar and UPI before anything else (an invite link resumes afterwards).
  if (me.data && !me.data.onboarded && loc.pathname !== "/welcome") {
    return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }

  return (
    <div className="relative h-full overflow-hidden bg-chrome">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.main
          key={loc.pathname}
          className="absolute inset-0"
          style={{ willChange: "opacity, transform" }}
          initial={page ? { opacity: 0, x: 24 } : { opacity: 0 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ opacity: { duration: 0.2 }, x: snappy }}
        >
          {outlet}
        </motion.main>
      </AnimatePresence>
      {TAB_ROUTES.includes(loc.pathname) && <TabBar />}
      <AnimatePresence>
        {!online && (
          <motion.div
            role="status"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={snappy}
            className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+8px)] left-1/2 z-[55] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/90 px-3 py-1.5 text-[12px] font-semibold text-white ring-1 ring-white/10 backdrop-blur"
          >
            <CloudOffIcon />
            {queued ? `Offline · ${queued} to sync` : "Offline · showing saved data"}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
