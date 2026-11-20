import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { snappy } from "./motion";

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMsg({ id: Date.now(), text });
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4" style={{ bottom: "calc(92px + env(safe-area-inset-bottom, 0px))" }}>
        <AnimatePresence>
          {msg && (
            <motion.div
              key={msg.id}
              role="status"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={snappy}
              className="rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,.35)] ring-1 ring-white/10"
            >
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
