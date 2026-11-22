import { computeExpense, formatINR, inrParts, type SplitSpec } from "@lets-split/core";
import { useBack } from "../../lib/useBack";
import { accentOr, inkOn } from "../../lib/color";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { Expense, Group, Member, SplitInput } from "../../api/client";
import { useExpense, useGroups, useMe, useMembers } from "../../api/hooks";
import { useWrite, withKey } from "../../api/mutations";
import { CATEGORIES, firstName, tileColor } from "../../lib/people";
import { newId } from "../../lib/uuid";
import { Avatar } from "../../ui/Avatar";
import { confetti } from "../../ui/confetti";
import { BackIcon, CheckIcon } from "../../ui/icons";
import { bouncy, snappy } from "../../ui/motion";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { largestRemainder } from "../../ui/useSprings";
import { MORE_MODES, MoreEditor, type MoreMode } from "./SplitEditors";
import { SplitRing } from "./SplitRing";
import { UnevenSliders } from "./UnevenSliders";

type Mode = "equal" | "uneven" | MoreMode;
const MAX_PAISE = 10_000_000_000;

/** One-tap names; anything typed works too ("tapri ki chai", "snorkelling"...). */
const SUGGESTIONS = [
  { label: "Chai", category: "food" },
  { label: "Dinner", category: "food" },
  { label: "Cab", category: "travel" },
  { label: "Fuel", category: "travel" },
  { label: "Drinks", category: "drinks" },
  { label: "Stay", category: "stay" },
  { label: "Tickets", category: "fun" },
  { label: "Groceries", category: "shopping" },
];

const toPaise = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Add expense (and Edit, at /expenses/:id/edit): amount, chips, and the Equal | Uneven ticket. */
export function AddScreen() {
  const { expenseId } = useParams();
  const editing = useExpense(expenseId);
  const groups = useGroups();
  const [params] = useSearchParams();
  const open = (groups.data ?? []).filter((g) => !g.archivedAt);
  const wanted = editing.data?.groupId ?? params.get("group");
  const group = (groups.data ?? []).find((g) => g.id === wanted) ?? open[0];

  if (expenseId && !editing.data) return <div className="h-full bg-split" />;
  if (groups.isPending) return <div className="h-full bg-split" />;
  if (!group) return <NoTrip />;
  return <AddForm key={`${group.id}-${expenseId ?? "new"}`} group={group} groups={open} existing={editing.data} />;
}

function NoTrip() {
  return (
    <div className="grid h-full place-items-center bg-split px-8 text-center text-ink">
      <div>
        <p className="text-[22px] font-bold">Start a trip first</p>
        <p className="mt-2 text-[14px] leading-[1.5] text-muted">Expenses live inside a trip, so everyone in it can see and settle them.</p>
        <Link to="/?new=1" className="mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">
          New trip
        </Link>
      </div>
    </div>
  );
}

function initialFrom(e: Expense | undefined, active: Member[]) {
  const split = e?.splitMeta as SplitInput | undefined;
  const ids = active.map((m) => m.id);
  const on = new Set(ids);
  let mode: Mode = "equal";
  const uneven: Record<string, number> = {};
  const more: Record<string, string> = {};
  if (e && split) {
    mode = split.type === "exact" ? "uneven" : split.type;
    const involved = e.shares.filter((s) => s.amountPaise > 0).map((s) => s.memberId);
    if (split.type === "equal") {
      on.clear();
      split.members.forEach((id) => on.add(id));
    } else if (split.type === "adjustment") {
      on.clear();
      split.members.forEach((id) => on.add(id));
      split.adjustments.forEach((a) => (more[a.memberId] = String(a.amountPaise / 100)));
    } else {
      on.clear();
      involved.forEach((id) => on.add(id));
    }
    if (split.type === "exact") split.amounts.forEach((a) => (uneven[a.memberId] = a.amountPaise));
    if (split.type === "percent") split.percents.forEach((p) => (more[p.memberId] = String(p.percent)));
    if (split.type === "shares") split.shares.forEach((p) => (more[p.memberId] = String(p.weight)));
  }
  return { on, mode, uneven, more };
}

function AddForm({ group, groups, existing }: { group: Group; groups: Group[]; existing?: Expense }) {
  const nav = useNavigate();
  const goBack = useBack("/");
  const toast = useToast();
  const me = useMe();
  const membersQ = useMembers(group.id);
  const add = useWrite("addExpense");
  const update = useWrite("updateExpense");
  const active = useMemo(() => (membersQ.data ?? []).filter((m) => !m.removedAt), [membersQ.data]);
  const myId = group.myMemberId;

  const [amount, setAmount] = useState(existing ? String(existing.amountPaise / 100) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState<string>(existing?.category ?? "food");
  const [date, setDate] = useState(existing ? existing.spentAt.slice(0, 10) : today());
  const [on, setOn] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("equal");
  const [uneven, setUneven] = useState<Record<string, number>>({});
  const [more, setMore] = useState<Record<string, string>>({});
  const [payers, setPayers] = useState<Record<string, string> | null>(
    existing && (existing.payers.length > 1 || existing.payers[0]?.memberId !== myId)
      ? Object.fromEntries(existing.payers.map((p) => [p.memberId, String(p.amountPaise / 100)]))
      : null,
  );
  const [sheet, setSheet] = useState<null | "trip" | "payer" | "category" | "more">(null);
  const [stamped, setStamped] = useState(false);
  const [nudge, setNudge] = useState<null | "amount" | "name">(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [shake, setShake] = useState<string | null>(null);
  const ticket = useAnimationControls();
  const ready = useRef(false);
  const id = useRef(existing?.id ?? newId());

  // Fill in once members load (everyone on, or the saved expense's split when editing).
  useEffect(() => {
    if (ready.current || !active.length) return;
    ready.current = true;
    const init = initialFrom(existing, active);
    setOn(init.on);
    setMode(init.mode);
    setUneven(init.uneven);
    setMore(init.more);
  }, [active, existing]);

  const total = toPaise(amount || "0");
  const validTotal = Number.isFinite(total) && total > 0 && total <= MAX_PAISE;
  const included = active.filter((m) => on.has(m.id));
  const colorIndex = (m: Member) => Math.max(0, active.findIndex((x) => x.id === m.id));

  // Uneven: keep the pill values summing to the total; rescale when the total or the people change.
  const unevenVals = useMemo(() => {
    if (!included.length) return [];
    const cur = included.map((m) => uneven[m.id] ?? 0);
    const sum = cur.reduce((a, b) => a + b, 0);
    if (!validTotal) return included.map(() => 0);
    if (sum === total) return cur;
    return largestRemainder(total, sum > 0 ? cur : included.map(() => 1));
  }, [included.map((m) => m.id).join(), uneven, total, validTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPill(i: number, v: number) {
    if (!validTotal) return;
    const nv = Math.max(0, Math.min(total, v));
    const others = included.map((_, k) => k).filter((k) => k !== i);
    const rest = largestRemainder(total - nv, others.map((k) => unevenVals[k] ?? 0));
    const next: Record<string, number> = {};
    included.forEach((m, k) => (next[m.id] = k === i ? nv : rest[others.indexOf(k)]!));
    setUneven(next);
  }

  const split: SplitInput | null = useMemo(() => {
    if (!included.length) return null;
    const ids = included.map((m) => m.id);
    switch (mode) {
      case "equal":
        return { type: "equal", members: ids };
      case "uneven":
        return { type: "exact", amounts: included.map((m, k) => ({ memberId: m.id, amountPaise: unevenVals[k] ?? 0 })) };
      case "percent":
        return { type: "percent", percents: included.map((m) => ({ memberId: m.id, percent: Number(more[m.id] || 0) })) };
      case "shares":
        return { type: "shares", shares: included.map((m) => ({ memberId: m.id, weight: more[m.id] === undefined || more[m.id] === "" ? 1 : Number(more[m.id]) })) };
      case "adjustment":
        return {
          type: "adjustment",
          members: ids,
          adjustments: included.filter((m) => toPaise(more[m.id] || "0")).map((m) => ({ memberId: m.id, amountPaise: toPaise(more[m.id] || "0") })),
        };
    }
  }, [mode, included.map((m) => m.id).join(), unevenVals, more]); // eslint-disable-line react-hooks/exhaustive-deps

  const payerList = useMemo(() => {
    if (!payers) return myId && validTotal ? [{ memberId: myId, amountPaise: total }] : [];
    const ids = Object.keys(payers);
    // One payer always covers the whole (possibly edited) amount.
    if (ids.length === 1) return validTotal ? [{ memberId: ids[0]!, amountPaise: total }] : [];
    return Object.entries(payers)
      .map(([memberId, v]) => ({ memberId, amountPaise: toPaise(v || "0") }))
      .filter((p) => p.amountPaise > 0);
  }, [payers, myId, total, validTotal]);
  const payerSum = payerList.reduce((s, p) => s + p.amountPaise, 0);

  const preview = useMemo(() => {
    if (!validTotal || !split || !payerList.length) return { error: validTotal ? "Pick who's in" : null };
    try {
      const spec: SplitSpec =
        split.type === "equal" ? { type: "equal", members: split.members }
        : split.type === "exact" ? { type: "exact", amounts: Object.fromEntries(split.amounts.map((a) => [a.memberId, a.amountPaise])) }
        : split.type === "percent" ? { type: "percent", percents: Object.fromEntries(split.percents.map((p) => [p.memberId, p.percent])) }
        : split.type === "shares" ? { type: "shares", shares: Object.fromEntries(split.shares.map((p) => [p.memberId, p.weight])) }
        : { type: "adjustment", members: split.members, adjustments: Object.fromEntries(split.adjustments.map((a) => [a.memberId, a.amountPaise])) };
      const c = computeExpense({ total, payers: Object.fromEntries(payerList.map((p) => [p.memberId, p.amountPaise])), split: spec });
      return { shares: c.shares as Record<string, number> };
    } catch (e) {
      return { error: e instanceof Error ? e.message.replace(/^[a-z]/, (c) => c.toUpperCase()) : "That split doesn't add up" };
    }
  }, [split, payerList, total, validTotal]);

  const myShare = (myId && preview.shares?.[myId]) || 0;
  const myPaid = payerList.find((p) => p.memberId === myId)?.amountPaise ?? 0;
  const back = myPaid - myShare;
  const cta = !validTotal
    ? "Enter the amount"
    : !description.trim()
      ? "Name it to save"
      : preview.error
        ? preview.error
        : back > 0
          ? `${existing ? "Save changes" : "Save"} · you get back ${formatINR(back, { decimals: "auto" })}`
          : back < 0
            ? `${existing ? "Save changes" : "Save"} · you owe ${formatINR(-back, { decimals: "auto" })}`
            : existing ? "Save changes" : "Save expense";
  const canSave = validTotal && Boolean(description.trim()) && !preview.error && Boolean(split) && !stamped;

  function toggle(m: Member) {
    if (on.has(m.id) && on.size === 1) {
      setShake(m.id);
      setTimeout(() => setShake(null), 360);
      return;
    }
    const next = new Set(on);
    if (next.has(m.id)) next.delete(m.id);
    else next.add(m.id);
    setOn(next);
  }

  function flag(what: "amount" | "name") {
    setNudge(what);
    (what === "amount" ? amountRef : nameRef).current?.focus();
    setTimeout(() => setNudge(null), 900);
  }

  function save() {
    if (stamped) return;
    if (!validTotal) return flag("amount");
    if (!description.trim()) return flag("name");
    if (!canSave || !split) {
      if (preview.error) toast(preview.error);
      return;
    }
    const spentAt = date === today() && !existing ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
    const body = {
      description: description.trim(),
      amountPaise: total,
      category,
      spentAt,
      payers: payers ? payerList : undefined,
      split,
    };
    if (existing) update.mutate(withKey({ groupId: group.id, expenseId: existing.id, body }), { onError: (e) => toast(e.message) });
    else add.mutate(withKey({ groupId: group.id, body: { id: id.current, ...body } }), { onError: (e) => toast(`Couldn't save: ${e.message}`) });

    setStamped(true);
    setTimeout(() => {
      ticket.start({ scale: [1, 0.975, 1], y: [0, 3, 0], transition: { duration: 0.45, ease: [0.3, 1.6, 0.5, 1] } });
      confetti();
    }, 260);
    setTimeout(() => {
      if (!navigator.onLine) toast("Saved offline. It'll sync when you're back.");
      nav(existing ? `/expenses/${existing.id}` : `/trips/${group.id}`, { replace: true });
    }, 1300);
  }

  const parts = inrParts(validTotal ? total : 0);
  const equalEach = preview.shares && included[0] ? preview.shares[included[0].id] ?? 0 : 0;
  const shares = active.map((m) => (on.has(m.id) && preview.shares && total > 0 ? (preview.shares[m.id] ?? 0) / total : on.has(m.id) ? 1 / Math.max(1, on.size) : 0));
  const payerLabel = !payers ? "You paid" : payerList.length === 1 ? `${firstName(active.find((m) => m.id === payerList[0]!.memberId))} paid` : `${payerList.length} people paid`;
  const cat = CATEGORIES.find((c) => c.key === category);
  const isMore = mode === "percent" || mode === "shares" || mode === "adjustment";

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-split text-ink">
      <div className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <button type="button" onClick={goBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-card">
          <BackIcon />
        </button>
        <b className="text-[17px] font-semibold">{existing ? "Edit expense" : "New expense"}</b>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          transition={snappy}
          onClick={() => !existing && setSheet("trip")}
          className="flex h-[30px] max-w-[130px] items-center truncate rounded-full px-3 text-[13px] font-semibold"
          style={{ background: accentOr(group.accent), color: inkOn(group.accent) }}
        >
          <span className="truncate">{group.name}</span>
        </motion.button>
      </div>

      <div className="mt-4 px-5 text-center">
        <motion.label animate={nudge === "amount" ? { x: [0, -8, 8, -4, 0] } : { x: 0 }} transition={{ duration: 0.4 }} className="flex cursor-text items-baseline justify-center font-bold tracking-[-0.02em]">
          <span className="sr-only">Amount in rupees</span>
          <span className={`text-[26px] ${validTotal ? "" : "text-ink/30"}`}>₹</span>
          <input
            ref={amountRef}
            autoFocus={!existing}
            inputMode="decimal"
            enterKeyHint="next"
            onKeyDown={(e) => e.key === "Enter" && nameRef.current?.focus()}
            value={amount}
            placeholder="0"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").replace(/(\.\d\d)\d+$/, "$1"))}
            className="min-w-[1ch] bg-transparent text-center text-[58px] leading-[1.1] outline-none placeholder:text-ink/25"
            style={{ width: `${Math.max(1, (amount || "0").length) * 0.62 + 0.1}em` }}
          />
          <span className="text-[22px] font-medium text-[#8D92A6]">{amount.includes(".") ? "" : parts.decimal}</span>
        </motion.label>

        <motion.label
          animate={nudge === "name" ? { x: [0, -8, 8, -4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className={`mt-3 flex h-[54px] items-center gap-2.5 rounded-[18px] bg-card px-4 text-left ring-2 transition-shadow ${nudge === "name" ? "ring-neg" : "ring-transparent focus-within:ring-cobalt"}`}
        >
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tileColor(category) }} aria-hidden="true" />
          <span className="sr-only">Name this expense</span>
          <input
            ref={nameRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={120}
            enterKeyHint="done"
            autoCapitalize="sentences"
            placeholder="Name it: tapri ki chai, snorkelling…"
            className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-[#A2A7B2]"
          />
          {description && (
            <button type="button" aria-label="Clear name" onClick={() => setDescription("")} className="grid h-7 w-7 place-items-center rounded-full bg-sheet text-[15px] text-muted">
              ×
            </button>
          )}
        </motion.label>
        {!description.trim() && !existing && (
          <div className="no-scrollbar -mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5">
            {SUGGESTIONS.map((s) => (
              <motion.button
                key={s.label}
                type="button"
                whileTap={{ scale: 0.94 }}
                transition={snappy}
                onClick={() => {
                  setDescription(s.label);
                  setCategory(s.category);
                }}
                className="h-8 shrink-0 rounded-full bg-white/70 px-3 text-[12.5px] font-semibold text-ink ring-1 ring-black/5"
              >
                {s.label}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <div className="no-scrollbar mt-3 flex justify-center gap-2 overflow-x-auto px-5">
        <Chip onClick={() => setSheet("payer")}>{payerLabel}</Chip>
        <Chip onClick={() => setSheet("category")}>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: tileColor(category) }} />
          {cat?.label ?? "Other"}
        </Chip>
        <label className="relative">
          <Chip>{date === today() ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Chip>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0" aria-label="Date" />
        </label>
      </div>

      <motion.div animate={ticket} className="mx-3.5 mt-4 rounded-[28px] bg-card px-3.5 pt-3 pb-3">
        <div className="relative flex gap-1 rounded-full bg-[#F1F3FA] p-1" role="tablist" aria-label="Split">
          {(["equal", "uneven"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`relative z-10 h-[34px] flex-1 rounded-full text-[13.5px] font-semibold transition-colors duration-200 ${mode === k ? "text-white" : "text-[#6A6F82]"}`}
            >
              {mode === k && <motion.span layoutId="splitmode" transition={snappy} className="absolute inset-0 -z-10 rounded-full bg-ink" />}
              {k === "equal" ? "Equal" : "Uneven"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {mode === "uneven" ? (
            <motion.div key="uneven" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={snappy}>
              {validTotal ? (
                <UnevenSliders members={included} colorIndex={colorIndex} values={unevenVals} total={total} onSet={setPill} />
              ) : (
                <p className="py-10 text-center text-[14px] text-muted">Enter the amount, then drag the pills.</p>
              )}
              <div className="mt-1 flex justify-between rounded-[18px] bg-[#E2F6EC] px-4 py-3.5 text-[14px] font-semibold text-[#1B6B4A]">
                <span>Drag a pill · rest rebalance</span>
                <span>{formatINR(validTotal ? total : 0, { decimals: "auto" })} assigned</span>
              </div>
              <PeopleToggles active={active} on={on} toggle={toggle} shake={shake} compact />
            </motion.div>
          ) : (
            <motion.div key="equal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={snappy}>
              <div className="relative">
                <SplitRing
                  members={active}
                  shares={shares}
                  center={isMore ? MORE_MODES.find((m) => m.key === mode)!.label : formatINR(equalEach, { decimals: "auto" })}
                  sub={isMore ? `${included.length} people` : included.length === 1 ? "just one person" : `each · ${included.length} ways`}
                />
                <AnimatePresence>
                  {stamped && (
                    <motion.div
                      initial={{ opacity: 0, scale: 2.2, rotate: -24, x: "-50%", y: "-50%" }}
                      animate={{ opacity: 1, scale: 1, rotate: -13, x: "-50%", y: "-50%" }}
                      transition={{ duration: 0.55, ease: [0.2, 1.5, 0.4, 1] }}
                      className="pointer-events-none absolute top-[110px] left-1/2 rounded-[10px] border-[3px] border-cobalt bg-white/92 px-3.5 py-2 text-[15px] font-extrabold tracking-[0.14em] text-cobalt"
                    >
                      {existing ? "UPDATED" : "REQUESTED"}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="relative -mx-3.5 h-4 bg-[radial-gradient(circle_at_0_50%,#EEF1FB_9px,transparent_9.5px),radial-gradient(circle_at_100%_50%,#EEF1FB_9px,transparent_9.5px)] before:absolute before:inset-x-6 before:top-1/2 before:border-t-2 before:border-dashed before:border-[#D9DEF0]" />
              <div className="no-scrollbar my-1.5 flex gap-1.5 overflow-x-auto">
                <Preset on={mode === "equal" && on.size === active.length} onClick={() => { setMode("equal"); setOn(new Set(active.map((m) => m.id))); }}>
                  Everyone
                </Preset>
                {myId && active.length > 1 && (
                  <Preset on={mode === "equal" && on.size === active.length - 1 && !on.has(myId)} onClick={() => { setMode("equal"); setOn(new Set(active.filter((m) => m.id !== myId).map((m) => m.id))); }}>
                    Not me
                  </Preset>
                )}
                {MORE_MODES.map((m) => (
                  <Preset key={m.key} on={mode === m.key} onClick={() => { setMode(m.key); setSheet("more"); }}>
                    {m.label}
                  </Preset>
                ))}
              </div>
              <div>
                {active.map((m) => {
                  const isOn = on.has(m.id);
                  const amt = preview.shares?.[m.id] ?? 0;
                  const paid = payerList.find((p) => p.memberId === m.id)?.amountPaise ?? 0;
                  const sub = paid ? `Paid ${formatINR(paid, { decimals: "auto" })}` : m.isPlaceholder ? "Not joined yet" : isOn ? (m.isMe ? "Your share" : "Owes") : "Not in this one";
                  const a = inrParts(isOn ? amt : 0);
                  return (
                    <motion.button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m)}
                      animate={shake === m.id ? { x: [0, -5, 5, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      aria-pressed={isOn}
                      className="flex w-full items-center gap-2.5 rounded-[14px] px-1 py-1.5 text-left"
                    >
                      <motion.span animate={{ opacity: isOn ? 1 : 0.35, scale: isOn ? 1 : 0.85 }} transition={bouncy}>
                        <Avatar seed={m.id} avatarKey={m.avatarKey} size={36} />
                      </motion.span>
                      <span className={`min-w-0 flex-1 transition-opacity ${isOn ? "" : "opacity-40"}`}>
                        <b className="block truncate text-[14px] font-semibold">{m.isMe ? "You" : m.displayName}</b>
                        <span className="text-[11px] text-[#6A6F82]">{sub}</span>
                      </span>
                      <span className={`text-[15px] font-bold tabular-nums transition-opacity ${isOn ? "" : "opacity-40"}`}>
                        ₹{a.whole}
                        <small className="text-[10px] opacity-55">{a.decimal}</small>
                      </span>
                      <motion.span
                        animate={{ scale: isOn ? 1.06 : 1, backgroundColor: isOn ? "#121316" : "#FFFFFF", borderColor: isOn ? "#121316" : "#D3D8EA" }}
                        transition={bouncy}
                        className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-white"
                      >
                        <motion.span animate={{ opacity: isOn ? 1 : 0 }}>
                          <CheckIcon width={11} height={11} />
                        </motion.span>
                      </motion.span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {payers && payerSum !== total && validTotal && (
        <p className="mx-6 mt-2 text-center text-[13px] font-medium text-neg">
          Payers add up to {formatINR(payerSum)}, not {formatINR(total)}.
        </p>
      )}

      <div className="sticky bottom-0 mt-4 bg-gradient-to-t from-split from-60% to-transparent px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
        <motion.button
          type="button"
          whileTap={canSave ? { scale: 0.97 } : undefined}
          transition={snappy}
          onClick={save}
          aria-disabled={!canSave}
          className="h-14 w-full rounded-full bg-ink text-[15px] font-semibold text-white transition-opacity aria-disabled:opacity-60"
        >
          {cta}
        </motion.button>
      </div>

      <Sheet open={sheet === "trip"} onClose={() => setSheet(null)} title="Which trip?">
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSheet(null);
                nav(`/add?group=${g.id}`, { replace: true });
              }}
              className="flex h-14 items-center justify-between rounded-[16px] px-4 text-[15px] font-semibold"
              style={{ background: accentOr(g.accent), color: inkOn(g.accent) }}
            >
              {g.name}
              {g.id === group.id && <CheckIcon width={16} height={16} />}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "category"} onClose={() => setSheet(null)} title="Category">
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setCategory(c.key);
                setSheet(null);
              }}
              className={`flex h-14 items-center gap-3 rounded-[16px] bg-card px-4 text-[15px] font-semibold ${category === c.key ? "ring-2 ring-ink" : ""}`}
            >
              <span className="h-7 w-7 rounded-[9px]" style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "payer"} onClose={() => setSheet(null)} title="Who paid?">
        <PayerEditor active={active} myId={myId} total={validTotal ? total : 0} payers={payers} setPayers={setPayers} done={() => setSheet(null)} />
      </Sheet>

      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="Split another way">
        <div className="mb-3 flex gap-1 rounded-full bg-[#E5E6EA] p-1">
          {MORE_MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => setMode(m.key)} className={`h-9 flex-1 rounded-full text-[13.5px] font-semibold ${mode === m.key ? "bg-card text-ink" : "text-muted"}`}>
              {m.label}
            </button>
          ))}
        </div>
        {isMore && (
          <>
            <p className="mb-2 px-1 text-[13px] text-muted">{MORE_MODES.find((m) => m.key === mode)!.hint}</p>
            <div className="rounded-[var(--radius-card)] bg-card px-4 py-1">
              <MoreEditor mode={mode as MoreMode} members={included} values={more} onChange={(mid, v) => setMore((s) => ({ ...s, [mid]: v }))} />
            </div>
            {mode === "percent" && (
              <p className={`mt-2 px-1 text-[13px] font-semibold ${Math.abs(included.reduce((s, m) => s + Number(more[m.id] || 0), 0) - 100) < 0.001 ? "text-pos" : "text-neg"}`}>
                {included.reduce((s, m) => s + Number(more[m.id] || 0), 0)}% of 100%
              </p>
            )}
            {preview.error && <p className="mt-2 px-1 text-[13px] font-medium text-neg">{preview.error}</p>}
            <button type="button" onClick={() => setSheet(null)} className="mt-3 h-[52px] w-full rounded-full bg-ink font-semibold text-white">
              Done
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }} transition={snappy} onClick={onClick} className="flex h-8 shrink-0 items-center rounded-full bg-card px-3.5 text-[13px] font-semibold text-ink">
      {children}
    </motion.button>
  );
}

function Preset({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }} transition={snappy} onClick={onClick} className={`h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${on ? "bg-ink text-white" : "bg-[#F1F3FA]"}`}>
      {children}
    </motion.button>
  );
}

function PeopleToggles({ active, on, toggle, shake }: { active: Member[]; on: Set<string>; toggle: (m: Member) => void; shake: string | null; compact?: boolean }) {
  return (
    <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
      {active.map((m) => (
        <motion.button
          key={m.id}
          type="button"
          onClick={() => toggle(m)}
          aria-pressed={on.has(m.id)}
          animate={shake === m.id ? { x: [0, -5, 5, 0] } : { x: 0 }}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-1 text-[12.5px] font-semibold transition-colors ${on.has(m.id) ? "bg-ink text-white" : "bg-[#F1F3FA] text-muted"}`}
        >
          <Avatar seed={m.id} avatarKey={m.avatarKey} size={24} />
          {firstName(m)}
        </motion.button>
      ))}
    </div>
  );
}

function PayerEditor({
  active, myId, total, payers, setPayers, done,
}: { active: Member[]; myId: string | null; total: number; payers: Record<string, string> | null; setPayers: (p: Record<string, string> | null) => void; done: () => void }) {
  const [multi, setMulti] = useState(Boolean(payers && Object.keys(payers).length > 1));
  const sum = Object.values(payers ?? {}).reduce((s, v) => s + toPaise(v || "0"), 0);
  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-full bg-[#E5E6EA] p-1">
        {[false, true].map((m) => (
          <button
            key={String(m)}
            type="button"
            onClick={() => {
              setMulti(m);
              if (m && !payers && myId) setPayers({ [myId]: String(total / 100) });
            }}
            className={`h-9 flex-1 rounded-full text-[13.5px] font-semibold ${multi === m ? "bg-card text-ink" : "text-muted"}`}
          >
            {m ? "Several people" : "One person"}
          </button>
        ))}
      </div>
      <div className="rounded-[var(--radius-card)] bg-card px-4 py-1">
        {active.map((m) => {
          const single = !multi && (payers ? Object.keys(payers)[0] === m.id : m.id === myId);
          return multi ? (
            <label key={m.id} className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0">
              <Avatar seed={m.id} avatarKey={m.avatarKey} size={34} />
              <span className="flex-1 truncate text-[14px] font-semibold">{m.isMe ? "You" : m.displayName}</span>
              <span className="text-[13px] text-muted">₹</span>
              <input
                inputMode="decimal"
                value={payers?.[m.id] ?? ""}
                placeholder="0"
                onChange={(e) => setPayers({ ...(payers ?? {}), [m.id]: e.target.value.replace(/[^\d.]/g, "") })}
                className="h-11 w-[104px] rounded-[12px] bg-sheet px-3 text-right text-[16px] font-semibold outline-none focus:ring-2 focus:ring-cobalt"
                aria-label={`${firstName(m)} paid`}
              />
            </label>
          ) : (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setPayers(m.id === myId ? null : { [m.id]: String(total / 100) });
                done();
              }}
              className="flex w-full items-center gap-3 border-b border-hairline py-2.5 text-left last:border-b-0"
            >
              <Avatar seed={m.id} avatarKey={m.avatarKey} size={34} />
              <span className="flex-1 truncate text-[14px] font-semibold">{m.isMe ? "You" : m.displayName}</span>
              {single && <CheckIcon width={16} height={16} />}
            </button>
          );
        })}
      </div>
      {multi && (
        <>
          <p className={`mt-2 px-1 text-[13px] font-semibold ${sum === total ? "text-pos" : "text-neg"}`}>
            {formatINR(sum)} of {formatINR(total)} {sum === total ? "· adds up" : sum < total ? `· ${formatINR(total - sum)} left` : `· ${formatINR(sum - total)} too much`}
          </p>
          <button type="button" onClick={done} className="mt-3 h-[52px] w-full rounded-full bg-ink font-semibold text-white">
            Done
          </button>
        </>
      )}
    </div>
  );
}
