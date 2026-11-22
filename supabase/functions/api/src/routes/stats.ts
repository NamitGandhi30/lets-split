import { createRoute, z } from "@hono/zod-openapi";
import { fromPg, must, notFound } from "../errors.ts";
import { TripStats, Uuid } from "../schemas.ts";
import { auth, errors, json, router } from "./util.ts";

export const statsRoutes = router();

const IST_MS = 330 * 60_000;
/** Calendar day in India time for a timestamp. */
const istDay = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

interface Row {
  id: string;
  description: string;
  category: string | null;
  amount_paise: number;
  spent_at: string;
  expense_payers: { member_id: string; amount_paise: number }[];
  expense_shares: { member_id: string; amount_paise: number }[];
}

statsRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/stats",
    tags: ["stats"],
    summary: "Trip stats: daily spend, categories, who paid most",
    ...auth,
    request: { params: z.object({ groupId: Uuid.openapi({ param: { name: "groupId", in: "path" } }) }) },
    responses: { 200: json(TripStats, "Stats"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { groupId } = c.req.valid("param");

    const [group, members, exp] = await Promise.all([
      db.from("groups").select("starts_on, ends_on").eq("id", groupId).maybeSingle<{ starts_on: string | null; ends_on: string | null }>(),
      db.from("group_members").select("id, user_id, removed_at").eq("group_id", groupId),
      db
        .from("expenses")
        .select("id, description, category, amount_paise, spent_at, expense_payers(member_id, amount_paise), expense_shares(member_id, amount_paise)")
        .eq("group_id", groupId)
        .is("deleted_at", null)
        .returns<Row[]>(),
    ]);
    if (group.error) throw fromPg(group.error);
    const mine = must(members).find((m) => m.user_id === me && m.removed_at === null);
    if (!group.data || !mine) throw notFound("Group not found");
    const rows = must(exp);

    const total = rows.reduce((s, e) => s + Number(e.amount_paise), 0);

    // Days: the trip's dates when set, widened to include any expense outside them.
    const byDay = new Map<string, number>();
    for (const e of rows) byDay.set(istDay(e.spent_at), (byDay.get(istDay(e.spent_at)) ?? 0) + Number(e.amount_paise));
    const spentDays = [...byDay.keys()].sort();
    let first = group.data.starts_on ?? spentDays[0] ?? null;
    let last = group.data.ends_on ?? spentDays[spentDays.length - 1] ?? first;
    if (spentDays[0] && first && spentDays[0] < first) first = spentDays[0];
    if (spentDays.length && last && spentDays[spentDays.length - 1]! > last) last = spentDays[spentDays.length - 1]!;
    const days: { date: string; paise: number }[] = [];
    if (first && last) {
      for (let d = first, i = 0; d <= last && i < 120; d = addDays(d, 1), i++) days.push({ date: d, paise: byDay.get(d) ?? 0 });
    }
    const peak = days.reduce<{ date: string; paise: number } | null>((p, d) => (d.paise > 0 && (!p || d.paise > p.paise) ? d : p), null);

    const cats = new Map<string, number>();
    for (const e of rows) cats.set(e.category ?? "other", (cats.get(e.category ?? "other") ?? 0) + Number(e.amount_paise));
    const categories = [...cats.entries()]
      .map(([category, paise]) => ({ category, paise, percent: total ? Math.round((paise / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.paise - a.paise);

    const paid = new Map<string, number>();
    let share = 0;
    let paidMe = 0;
    for (const e of rows) {
      for (const p of e.expense_payers) {
        paid.set(p.member_id, (paid.get(p.member_id) ?? 0) + Number(p.amount_paise));
        if (p.member_id === mine.id) paidMe += Number(p.amount_paise);
      }
      for (const s of e.expense_shares) if (s.member_id === mine.id) share += Number(s.amount_paise);
    }
    const paidBy = [...paid.entries()].map(([memberId, paise]) => ({ memberId, paise })).sort((a, b) => b.paise - a.paise);
    const peakDay = peak
      ? {
          ...peak,
          index: days.findIndex((d) => d.date === peak.date),
          topDescription:
            rows.filter((e) => istDay(e.spent_at) === peak.date).sort((a, b) => Number(b.amount_paise) - Number(a.amount_paise))[0]?.description ?? null,
        }
      : null;
    const big = rows.reduce<Row | null>((b, e) => (!b || Number(e.amount_paise) > Number(b.amount_paise) ? e : b), null);

    return c.json(
      {
        groupId,
        totalSpentPaise: total,
        expenseCount: rows.length,
        perDayPaise: days.length ? Math.round(total / days.length) : total,
        days,
        peakDay,
        categories,
        paidBy,
        me: { memberId: mine.id, sharePaise: share, paidPaise: paidMe },
        biggest: big ? { id: big.id, description: big.description, amountPaise: Number(big.amount_paise) } : null,
      },
      200,
    );
  },
);
