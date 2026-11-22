import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { snappy, tf } from "./motion";

type Action = { label: string; onClick: () => void };
type Show = (msg: string, action?: Action, ms?: number) => void;

const Ctx = createContext<Show>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string; action?: Action } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback<Show>((text, action, ms) => {
    clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setMsg(null), ms ?? (action ? 5000 : 2600));
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none absolute inset-x-0 z-[60] flex justify-center px-4" style={{ bottom: "calc(92px + env(safe-area-inset-bottom, 0px))" }}>
        <AnimatePresence>
          {msg && (
            <motion.div
              key={msg.id}
              role="status"
              initial={{ opacity: 0, transform: tf(0, 16, 0.96) }}
              animate={{ opacity: 1, transform: tf() }}
              exit={{ opacity: 0, transform: tf(0, 8, 0.98) }}
              transition={snappy}
              className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-2.5 pr-2.5 pl-4 text-[13.5px] font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,.35)] ring-1 ring-white/10"
              style={msg.action ? undefined : { paddingRight: 16 }}
            >
              <span>{msg.text}</span>
              {msg.action && (
                <button
                  type="button"
                  onClick={() => {
                    msg.action!.onClick();
                    setMsg(null);
                  }}
                  className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold text-goa"
                >
                  {msg.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
