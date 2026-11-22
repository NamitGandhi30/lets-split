import { formatINR } from "@lets-split/core";
import { useBack } from "../../lib/useBack";
import { accentOr, inkOn } from "../../lib/color";
import { motion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { SplitInput } from "../../api/client";
import { useComments, useExpense, useGroup, useHistory, useMembers } from "../../api/hooks";
import { useWrite, withKey } from "../../api/mutations";
import { ago, firstName, nameOf, tileColor, when } from "../../lib/people";
import { newId } from "../../lib/uuid";
import { Amount } from "../../ui/Amount";
import { Avatar } from "../../ui/Avatar";
import { BackIcon } from "../../ui/icons";
import { snappy, tf } from "../../ui/motion";
import { useToast } from "../../ui/Toast";

const SPLIT_LABEL: Record<string, string> = {
  equal: "SPLIT EQUALLY",
  exact: "SPLIT UNEVENLY",
  percent: "SPLIT BY PERCENT",
  shares: "SPLIT BY SHARES",
  adjustment: "SPLIT WITH ADJUSTMENTS",
  itemized: "SPLIT BY ITEMS",
};

export function ExpenseScreen() {
  const { expenseId = "" } = useParams();
  const nav = useNavigate();
  const goBack = useBack("/");
  const toast = useToast();
  const exp = useExpense(expenseId);
  const e = exp.data;
  const group = useGroup(e?.groupId);
  const members = useMembers(e?.groupId);
  const history = useHistory(expenseId);
  const comments = useComments(expenseId);
  const del = useWrite("deleteExpense");
  const restore = useWrite("restoreExpense");
  const comment = useWrite("addComment");
  const [body, setBody] = useState("");
  const map = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m])), [members.data]);

  // A failed refresh with the expense already on the phone (weak signal) is not "not found".
  if (exp.isError && !exp.data) {
    return (
      <div className="grid h-full place-items-center bg-sheet px-8 text-center text-ink">
        <div>
          <p className="text-[20px] font-bold">Expense not found</p>
          <Link to="/" className="mt-4 inline-flex h-11 items-center rounded-full bg-ink px-5 font-semibold text-white">Home</Link>
        </div>
      </div>
    );
  }
  if (!e) return <div className="h-full bg-sheet" />;

  const myId = group.data?.myMemberId ?? null;
  const payer = e.payers.length === 1 ? map.get(e.payers[0]!.memberId) : undefined;
  const myShare = e.shares.find((s) => s.memberId === myId)?.amountPaise ?? 0;
  const myPaid = e.payers.find((p) => p.memberId === myId)?.amountPaise ?? 0;
  const net = myPaid - myShare;
  const maxShare = Math.max(1, ...e.shares.map((s) => s.amountPaise));
  const split = e.splitMeta as SplitInput | undefined;
  const involved = e.shares.filter((s) => s.amountPaise > 0);
  const deleted = Boolean(e.deletedAt);

  function remove() {
    if (!e) return;
    del.mutate(withKey({ groupId: e.groupId, expenseId: e.id }));
    toast(`Deleted ${e.description}`, { label: "Undo", onClick: () => restore.mutate(withKey({ groupId: e.groupId, expenseId: e.id })) });
    nav(`/trips/${e.groupId}`, { replace: true });
  }

  function send(ev: FormEvent) {
    ev.preventDefault();
    const text = body.trim();
    if (!text) return;
    comment.mutate(withKey({ expenseId, id: newId(), body: text }));
    setBody("");
  }

  const detail = (who: string) => {
    if (!split) return "";
    if (split.type === "percent") return `${split.percents.find((p) => p.memberId === who)?.percent ?? 0}%`;
    if (split.type === "shares") return `×${split.shares.find((p) => p.memberId === who)?.weight ?? 0}`;
    if (split.type === "adjustment") {
      const a = split.adjustments.find((x) => x.memberId === who)?.amountPaise;
      return a ? `${a > 0 ? "+" : "−"}${formatINR(Math.abs(a), { decimals: "auto" })}` : "";
    }
    return "";
  };

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-sheet text-ink">
      <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-5 text-center">
        <div className="flex justify-between">
          <button type="button" onClick={goBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-card">
            <BackIcon />
          </button>
          <Link to={`/trips/${e.groupId}`} className="flex h-[30px] items-center self-center rounded-full px-3 text-[13px] font-semibold" style={{ background: accentOr(group.data?.accent), color: inkOn(group.data?.accent) }}>
            {group.data?.name ?? "Trip"}
          </Link>
        </div>
        <motion.div
          initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 170, damping: 13 }}
          className="mx-auto mt-[18px] mb-2.5 grid h-16 w-16 place-items-center rounded-[20px] text-[26px] font-bold text-white"
          style={{ background: tileColor(e.category) }}
          aria-hidden="true"
        >
          {e.description.trim().charAt(0).toUpperCase()}
        </motion.div>
        <h1 className="text-[20px] font-semibold">{e.description}</h1>
        <div className="mt-1.5 flex justify-center">
          <Amount paise={e.amountPaise} size={{ cur: 24, whole: 52, dec: 20 }} />
        </div>
        <div className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-card py-1.5 pr-3 pl-1.5 text-[13px] font-medium">
          {payer ? <Avatar seed={payer.id} avatarKey={payer.avatarKey} size={26} /> : <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-sheet text-[11px] font-bold">{e.payers.length}</span>}
          Paid by {payer ? nameOf(payer, "you") : `${e.payers.length} people`} · {when(e.spentAt)} ·{" "}
          {new Date(e.spentAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </div>
        {deleted && <p className="mt-3 text-[13px] font-semibold text-neg">This expense was deleted.</p>}
      </div>

      {e.payers.length > 1 && (
        <div className="mx-[18px] mb-3 rounded-[var(--radius-card)] bg-card px-4 py-3.5">
          <h3 className="mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">PAID BY</h3>
          {e.payers.map((p) => (
            <div key={p.memberId} className="flex items-center gap-2.5 py-1.5">
              <Avatar seed={p.memberId} avatarKey={map.get(p.memberId)?.avatarKey} size={28} />
              <span className="flex-1 text-[14px] font-semibold">{nameOf(map.get(p.memberId))}</span>
              <b className="text-[14px] text-pos">{formatINR(p.amountPaise)}</b>
            </div>
          ))}
        </div>
      )}

      <div className="mx-[18px] mb-3 rounded-[var(--radius-card)] bg-card px-4 py-3.5">
        <h3 className="mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">
          {SPLIT_LABEL[e.splitType] ?? "SPLIT"} · {involved.length} {involved.length === 1 ? "PERSON" : "PEOPLE"}
        </h3>
        {involved.map((s, i) => {
          const m = map.get(s.memberId);
          const paid = e.payers.some((p) => p.memberId === s.memberId);
          return (
            <div key={s.memberId} className="flex items-center gap-2.5 py-2">
              <Avatar seed={s.memberId} avatarKey={m?.avatarKey} size={28} />
              <span className="w-[72px] truncate text-[14px] font-semibold">{nameOf(m)}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-hairline">
                <motion.i
                  className="block h-full origin-left rounded-full"
                  style={{ width: `${(s.amountPaise / maxShare) * 100}%`, background: paid ? "var(--color-pos)" : tileColor(e.category) }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, ease: [0.2, 0.9, 0.2, 1], delay: i * 0.08 }}
                />
              </span>
              <span className="w-[86px] text-right text-[14px] font-bold">
                {formatINR(s.amountPaise, { decimals: "auto" })}
                {detail(s.memberId) && <small className="block text-[10.5px] font-medium text-muted">{detail(s.memberId)}</small>}
              </span>
            </div>
          );
        })}
      </div>

      {myId && (myShare > 0 || myPaid > 0) && (
        <div className="mx-[18px] mb-3 rounded-[var(--radius-card)] bg-card px-4 py-3.5">
          <h3 className="mb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted">YOUR SHARE</h3>
          <div className="flex items-baseline justify-between">
            <Amount paise={myShare} size={{ cur: 16, whole: 24, dec: 14 }} />
            <span className={`text-[14px] font-semibold ${net > 0 ? "text-pos" : net < 0 ? "text-neg" : "text-muted"}`}>
              {net > 0 ? `you lent ${formatINR(net)}` : net < 0 ? `you owe ${payer ? firstName(payer) + " " : ""}${formatINR(-net)}` : "you're square"}
            </span>
          </div>
        </div>
      )}

      <div className="mx-[18px] mb-3 rounded-[var(--radius-card)] bg-card px-4 py-3.5">
        <h3 className="mb-2 text-[12px] font-semibold tracking-[0.06em] text-muted">ACTIVITY</h3>
        <div className="flex flex-col gap-2 text-[13px] text-muted">
          {(history.data ?? []).map((h) => (
            <span key={`h${h.id}`}>
              <b className="font-semibold text-ink">{h.actorName ?? "Someone"}</b>{" "}
              {h.op === "insert" ? "added this" : h.op === "delete" ? "deleted this" : h.op === "restore" ? "restored this" : `changed the ${h.changes.join(", ") || "details"}`} · {ago(h.createdAt)}
            </span>
          ))}
          {(comments.data ?? []).map((c) => (
            <motion.span key={c.id} initial={{ opacity: 0, transform: tf(0, 6) }} animate={{ opacity: 1, transform: tf() }} transition={snappy}>
              <b className="font-semibold text-ink">{c.authorName}</b> “{c.body}” · {ago(c.createdAt)}
            </motion.span>
          ))}
        </div>
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            maxLength={1000}
            placeholder="Add a comment"
            aria-label="Add a comment"
            className="h-11 flex-1 rounded-full bg-sheet px-4 text-[15px] outline-none focus:ring-2 focus:ring-cobalt"
          />
          <motion.button type="submit" whileTap={{ scale: 0.94 }} transition={snappy} disabled={!body.trim()} className="h-11 rounded-full bg-ink px-4 text-[14px] font-semibold text-white disabled:opacity-30">
            Send
          </motion.button>
        </form>
      </div>

      <div className="mx-[18px] mt-1 mb-[120px] flex gap-2.5">
        {deleted ? (
          <button type="button" onClick={() => restore.mutate(withKey({ groupId: e.groupId, expenseId: e.id }))} className="h-[52px] flex-1 rounded-full bg-card font-semibold">
            Restore
          </button>
        ) : (
          <>
            <Link to={`/expenses/${e.id}/edit`} className="grid h-[52px] flex-1 place-items-center rounded-full bg-card font-semibold">
              Edit
            </Link>
            <button type="button" onClick={remove} className="h-[52px] flex-1 rounded-full bg-card font-semibold text-neg">
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
