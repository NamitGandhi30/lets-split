import { AnimatePresence, motion } from "motion/react";
import { useLocation, useOutlet } from "react-router";
import { TabBar } from "../ui/TabBar";

const TAB_ROUTES = ["/", "/add", "/stats"];

/** Signed-in layout: the current screen plus the floating tab bar on the three tab screens. */
export function AppShell() {
  const loc = useLocation();
  const outlet = useOutlet();
  return (
    <div className="relative h-full overflow-hidden bg-chrome">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.main
          key={loc.pathname}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ opacity: { duration: 0.35 }, scale: { duration: 0.45, ease: [0.2, 0.9, 0.2, 1] } }}
        >
          {outlet}
        </motion.main>
      </AnimatePresence>
      {TAB_ROUTES.includes(loc.pathname) && <TabBar />}
    </div>
  );
}
