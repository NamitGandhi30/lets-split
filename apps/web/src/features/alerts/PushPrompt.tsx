import { AnimatePresence, motion } from "motion/react";
import { usePush, type PushState } from "../../lib/push";
import { BellIcon, ShareIcon } from "../../ui/icons";
import { bouncy, snappy } from "../../ui/motion";
import { useToast } from "../../ui/Toast";

const NOTE: Record<PushState, string> = {
  on: "New expenses, payments and reminders show on your lock screen.",
  off: "Get new expenses, payments and reminders on your lock screen.",
  install: "Add Let's Split to your Home Screen first: tap Share, then Add to Home Screen. Open it from there.",
  blocked: "Turned off for this app. Turn it back on in iPhone Settings › Notifications › Let's Split.",
  unsupported: "This phone can't show notifications from web apps. iPhone needs iOS 16.4 or newer.",
  unavailable: "Notifications aren't switched on for Let's Split yet.",
};

/** Profile row: a switch, or a short note on what's in the way. */
export function PushSettingRow() {
  const toast = useToast();
  const { state, busy, enable, disable } = usePush();
  if (!state) return <div className="h-[74px] animate-pulse rounded-[16px] bg-card" />;
  const on = state === "on";
  const canToggle = state === "on" || state === "off";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={!canToggle || busy}
      onClick={async () => {
        try {
          await (on ? disable() : enable());
        } catch {
          toast("Couldn't change notifications. Try again with signal.");
        }
      }}
      className="flex w-full items-center gap-3 rounded-[16px] bg-card px-4 py-3.5 text-left"
    >
      <span className="flex-1">
        <b className="block text-[14px] font-semibold">Lock screen notifications</b>
        <span className="text-[12px] leading-[1.4] text-muted">{NOTE[state]}</span>
      </span>
      {canToggle && (
        <motion.span
          animate={{ backgroundColor: on ? "var(--color-pos)" : "#D3D8EA" }}
          transition={snappy}
          className={`relative h-[30px] w-[50px] shrink-0 rounded-full ${busy ? "opacity-60" : ""}`}
        >
          <motion.span
            animate={{ x: on ? 22 : 2 }}
            transition={bouncy}
            className="absolute top-[2px] left-0 h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.18)]"
          />
        </motion.span>
      )}
    </button>
  );
}

/** Alerts screen card: shown until notifications are on (or can't be). */
export function PushPromptCard() {
  const toast = useToast();
  const { state, busy, enable } = usePush();
  const show = state === "off" || state === "install";
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={snappy}
          className="overflow-hidden"
        >
          <div className="mx-[18px] mt-4 flex items-start gap-3 rounded-[var(--radius-card)] bg-ink p-4 text-white">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/12">
              {state === "install" ? <ShareIcon width={18} height={18} /> : <BellIcon width={18} height={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[15px] font-semibold">Get these on your lock screen</b>
              <p className="mt-0.5 text-[12.5px] leading-[1.45] text-white/70">{NOTE[state]}</p>
              {state === "off" && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={snappy}
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const next = await enable();
                      if (next === "on") toast("Notifications on");
                      else if (next === "blocked") toast("Allow notifications in iPhone Settings › Let's Split");
                    } catch {
                      toast("Couldn't turn on notifications. Try again with signal.");
                    }
                  }}
                  className="mt-3 h-9 rounded-full bg-white px-4 text-[13.5px] font-semibold text-ink disabled:opacity-50"
                >
                  Turn on
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
