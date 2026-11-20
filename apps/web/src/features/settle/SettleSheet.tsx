import { buildUpiAppLinks, formatINR, inrParts, isValidVpa } from "@lets-split/core";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Group, Member } from "../../api/client";
import { useWrite, withKey } from "../../api/mutations";
import { firstName } from "../../lib/people";
import { newId } from "../../lib/uuid";
import { Avatar } from "../../ui/Avatar";
import { confetti } from "../../ui/confetti";
import { CheckIcon, CopyIcon, DownloadIcon } from "../../ui/icons";
import { bouncy, snappy } from "../../ui/motion";
import { Qr, qrPng } from "../../ui/Qr";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { remindText, whatsappUrl } from "./remind";

export type SettleTarget = { from: string; to: string; amountPaise: number };

/** Settle up: the UPI sheet when you pay, "got it" when you're paid, or recording someone else's payment. */
export function SettleSheet({ open, onClose, group, members, target }: { open: boolean; onClose: () => void; group: Group; members: Member[]; target: SettleTarget }) {
  const map = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const from = map.get(target.from);
  const to = map.get(target.to);
  const title = from?.isMe ? `Pay ${firstName(to)}` : to?.isMe ? `${firstName(from)} pays you` : "Record a payment";
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <SettleBody group={group} map={map} target={target} onDone={onClose} />
    </Sheet>
  );
}

const APPS = [
  { key: "gpay", label: "GPay", bg: "#FFFFFF", fg: "#1A73E8" },
  { key: "phonepe", label: "PhonePe", bg: "#5F259F", fg: "#FFFFFF" },
  { key: "paytm", label: "Paytm", bg: "#00BAF2", fg: "#FFFFFF" },
] as const;

function SettleBody({ group, map, target, onDone }: { group: Group; map: Map<string, Member>; target: SettleTarget; onDone: () => void }) {
  const toast = useToast();
  const record = useWrite("addSettlement");
  const undo = useWrite("deleteSettlement");
  const from = map.get(target.from);
  const to = map.get(target.to);
  const [amount, setAmount] = useState(String(target.amountPaise / 100));
  const [step, setStep] = useState<"pay" | "confirm">("pay");
  const [settlementId] = useState(newId);
  const paise = Math.round(Number(amount) * 100);
  const validAmount = Number.isFinite(paise) && paise > 0 && paise <= 10_000_000_000;

  const iPay = Boolean(from?.isMe);
  const iGet = Boolean(to?.isMe);
  // When I'm paid, show my own QR so they can scan it from my phone.
  const payee = to;
  const vpa = payee?.upiId && isValidVpa(payee.upiId) ? payee.upiId : null;
  const links = useMemo(() => {
    if (!vpa || !validAmount) return null;
    try {
      return buildUpiAppLinks({ vpa, name: payee?.displayName, amount: paise, note: `${group.name} · Let's Split`, ref: settlementId.replace(/-/g, "").slice(0, 20) });
    } catch {
      return null;
    }
  }, [vpa, validAmount, paise, payee?.displayName, group.name, settlementId]);

  function save(method: "upi" | "cash" | "other") {
    if (!validAmount) return;
    record.mutate(
      withKey({ groupId: group.id, body: { id: settlementId, fromMemberId: target.from, toMemberId: target.to, amountPaise: paise, method } }),
      { onError: (e) => toast(e.message) },
    );
    confetti();
    onDone();
    toast(`${iPay ? "You" : firstName(from)} paid ${iGet ? "you" : firstName(to)} ${formatINR(paise)}`, {
      label: "Undo",
      onClick: () => undo.mutate(withKey({ groupId: group.id, settlementId })),
    });
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast("Couldn't copy");
    }
  }

  async function saveQr() {
    if (!links) return;
    const url = await qrPng(links.upi, `Pay ${payee?.displayName ?? ""} ${formatINR(paise)}`);
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `pay-${(payee?.displayName ?? "upi").toLowerCase().replace(/\W+/g, "-")}.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "UPI QR" });
        return;
      }
    } catch {
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
  }

  const parts = inrParts(validAmount ? paise : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-3 pt-1">
        <Avatar seed={target.from} avatarKey={from?.avatarKey} size={44} />
        <motion.span initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={bouncy} className="text-[20px] text-muted">
          →
        </motion.span>
        <Avatar seed={target.to} avatarKey={to?.avatarKey} size={44} />
      </div>
      <label className="mx-auto flex items-baseline justify-center font-bold tracking-[-0.02em]">
        <span className="sr-only">Amount</span>
        <span className="text-[26px] font-semibold opacity-80">₹</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
          className="w-[min(70vw,260px)] bg-transparent text-center text-[48px] outline-none"
          style={{ width: `${Math.max(2, parts.whole.length + (amount.includes(".") ? 3 : 0)) + 0.6}ch` }}
        />
      </label>
      {paise !== target.amountPaise && validAmount && (
        <p className="-mt-2 text-center text-[12.5px] text-muted">Full balance is {formatINR(target.amountPaise)}. Partial payments are fine.</p>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {step === "pay" ? (
          <motion.div key="pay" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={snappy} className="flex flex-col gap-3">
            {(iPay || iGet) && links ? (
              <div className="rounded-[var(--radius-card)] bg-card p-4">
                <div className="flex gap-4">
                  <div className="shrink-0 rounded-[14px] p-1.5" style={{ background: group.accent ?? "#F4D23C" }}>
                    <div className="rounded-[10px] bg-white p-1">
                      <Qr value={links.upi} size={116} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-semibold tracking-[0.06em] text-muted">{iGet ? "YOUR UPI" : "UPI ID"}</span>
                    <button type="button" onClick={() => copy(vpa!, "UPI ID")} className="mt-0.5 flex w-full items-center gap-1.5 text-left">
                      <b className="truncate text-[15px] font-semibold">{vpa}</b>
                      <CopyIcon className="shrink-0 text-muted" />
                    </button>
                    <button type="button" onClick={() => copy((paise / 100).toFixed(2), "Amount")} className="mt-2 flex items-center gap-1.5 rounded-full bg-sheet px-3 py-1.5 text-[12.5px] font-semibold">
                      <CopyIcon width={14} height={14} /> Copy amount
                    </button>
                    <button type="button" onClick={saveQr} className="mt-1.5 flex items-center gap-1.5 rounded-full bg-sheet px-3 py-1.5 text-[12.5px] font-semibold">
                      <DownloadIcon width={14} height={14} /> Save QR
                    </button>
                  </div>
                </div>
                {iGet && <p className="mt-3 text-[12.5px] text-muted">Let {firstName(from)} scan this with any UPI app.</p>}
              </div>
            ) : (iPay || iGet) ? (
              <div className="rounded-[var(--radius-card)] bg-card p-4 text-[14px] leading-[1.5]">
                {iGet ? (
                  <>You haven't added a UPI ID. <Link to="/me" className="font-semibold text-cobalt">Add it</Link> so friends can pay you in a tap.</>
                ) : payee?.noUpi ? (
                  <>{firstName(payee)} doesn't use UPI. Pay in cash, then record it here.</>
                ) : (
                  <>
                    {firstName(payee)} hasn't added a UPI ID yet.{" "}
                    <a
                      className="font-semibold text-cobalt"
                      href={whatsappUrl(`Hey ${firstName(payee, "")}, what's your UPI ID? I want to settle ${group.name} on Let's Split.`)}
                      target="_blank"
                      rel="noopener"
                    >
                      Ask on WhatsApp
                    </a>
                  </>
                )}
              </div>
            ) : null}

            {iPay && links && (
              <div className="flex gap-2">
                {APPS.map((a) => (
                  <motion.a
                    key={a.key}
                    href={links[a.key]}
                    whileTap={{ scale: 0.95 }}
                    transition={snappy}
                    onClick={() => setTimeout(() => setStep("confirm"), 600)}
                    className="flex h-[52px] flex-1 items-center justify-center rounded-[16px] text-[14px] font-bold ring-1 ring-black/5"
                    style={{ background: a.bg, color: a.fg }}
                  >
                    {a.label}
                  </motion.a>
                ))}
              </div>
            )}

            {iPay ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("confirm")} disabled={!validAmount} className="h-[52px] flex-1 rounded-full bg-ink text-[15px] font-semibold text-white disabled:opacity-40">
                  {links ? "I've paid" : "Record payment"}
                </button>
                <button type="button" onClick={() => save("cash")} disabled={!validAmount} className="h-[52px] rounded-full bg-card px-5 text-[14px] font-semibold disabled:opacity-40">
                  Paid cash
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => save("upi")} disabled={!validAmount} className="h-[52px] flex-1 rounded-full bg-ink text-[15px] font-semibold text-white disabled:opacity-40">
                  {iGet ? "Got it on UPI" : "Paid on UPI"}
                </button>
                <button type="button" onClick={() => save("cash")} disabled={!validAmount} className="h-[52px] rounded-full bg-card px-5 text-[14px] font-semibold disabled:opacity-40">
                  Cash
                </button>
              </div>
            )}
            {iGet && (
              <a
                href={whatsappUrl(remindText(target, map, group.name))}
                target="_blank"
                rel="noopener"
                className="text-center text-[13.5px] font-semibold text-muted"
              >
                Remind {firstName(from)} on WhatsApp
              </a>
            )}
          </motion.div>
        ) : (
          <motion.div key="confirm" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={bouncy} className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-card px-4 py-5 text-center">
            <b className="text-[19px] font-bold">Did it go through?</b>
            <p className="text-[13.5px] leading-[1.45] text-muted">Check your UPI app. We'll mark {formatINR(validAmount ? paise : 0)} to {firstName(to)} as paid.</p>
            <div className="flex w-full gap-2">
              <motion.button type="button" whileTap={{ scale: 0.96 }} transition={snappy} onClick={() => save("upi")} className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-pos text-[15px] font-semibold text-white">
                <CheckIcon width={16} height={16} /> Yes, paid
              </motion.button>
              <button type="button" onClick={() => setStep("pay")} className="h-[52px] flex-1 rounded-full bg-sheet text-[15px] font-semibold">
                Not yet
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
