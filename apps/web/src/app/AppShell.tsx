import { useIsMutating, useIsRestoring } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocation, useOutlet } from "react-router";
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
  const page = isPage(loc.pathname);

  return (
    <div className="relative h-full overflow-hidden bg-chrome">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.main
          key={loc.pathname}
          className="absolute inset-0"
          initial={page ? { opacity: 0, x: 40 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ opacity: { duration: 0.35 }, scale: { duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }, x: { duration: 0.45, ease: [0.2, 0.9, 0.2, 1] } }}
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
