import { motion } from "motion/react";
import { NavLink, useLocation } from "react-router";
import { HomeIcon, PlusIcon, StatsIcon } from "./icons";
import { bouncy } from "./motion";

const TABS = [
  { to: "/", label: "Home", Icon: HomeIcon },
  { to: "/add", label: "Add expense", Icon: PlusIcon },
  { to: "/stats", label: "Trip stats", Icon: StatsIcon },
] as const;

/** Floating pill: Home · ＋ · Stats, with a white blob that springs to the active tab. */
export function TabBar() {
  const { pathname } = useLocation();
  const idx = Math.max(0, TABS.findIndex((t) => (t.to === "/" ? pathname === "/" : pathname.startsWith(t.to))));
  return (
    <nav
      aria-label="Main"
      className="fixed left-1/2 z-40 flex -translate-x-1/2 gap-[5px] rounded-full bg-tabbar p-1.5 shadow-[0_10px_24px_rgba(0,0,0,.35)]"
      style={{ bottom: "calc(18px + env(safe-area-inset-bottom, 0px))" }}
    >
      <motion.span
        aria-hidden="true"
        className="absolute top-1.5 left-1.5 h-[46px] w-[50px] rounded-full bg-on-dark"
        initial={false}
        animate={{ x: idx * 55 }}
        transition={bouncy}
      />
      {TABS.map(({ to, label, Icon }, i) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          aria-label={label}
          className={`relative z-10 grid h-[46px] w-[50px] place-items-center rounded-full transition-colors duration-300 ${
            i === idx ? "text-[#111]" : "text-[#8E94A0]"
          }`}
        >
          <Icon />
        </NavLink>
      ))}
    </nav>
  );
}
