import { createRoute, z } from "@hono/zod-openapi";
import { fromPg, must, notFound } from "../errors.ts";
import { Uuid, Wrapped } from "../schemas.ts";
import { auth, errors, json, router } from "./util.ts";

export const wrappedRoutes = router();

const IST_MS = 330 * 60_000;
const istDay = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10);
const istHour = (iso: string) => new Date(Date.parse(iso) + IST_MS).getUTCHours();
const CHAI = /\b(chai|cha|tea|coffee|kadak|cutting)\b/i;

interface Row {
  description: string;
  category: string | null;
  amount_paise: number;
  spent_at: string;
  created_at: string;
  created_by: string;
  expense_payers: { member_id: string; amount_paise: number }[];
}

wrappedRoutes.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/wrapped",
    tags: ["stats"],
    summary: "Numbers for the five Trip Wrapped stories",
    ...auth,
    request: { params: z.object({ groupId: Uuid.openapi({ param: { name: "groupId", in: "path" } }) }) },
    responses: { 200: json(Wrapped, "Wrapped"), ...errors },
  }),
  async (c) => {
    const db = c.get("db");
    const me = c.get("user").id;
    const { groupId } = c.req.valid("param");
    const [g, mem, exp] = await Promise.all([
      db.from("groups").select("name, starts_on, ends_on").eq("id", groupId).maybeSingle<{ name: string; starts_on: string | null; ends_on: string | null }>(),
      db.from("group_members").select("id, user_id, display_name, removed_at").eq("group_id", groupId),
      db
        .from("expenses")
        .select("description, category, amount_paise, spent_at, created_at, created_by, expense_payers(member_id, amount_paise)")
        .eq("group_id", groupId)
        .is("deleted_at", null)
        .returns<Row[]>(),
    ]);
    if (g.error) throw fromPg(g.error);
    const members = must(mem) as { id: string; user_id: string | null; display_name: string; removed_at: string | null }[];
    const mine = members.find((m) => m.user_id === me && m.removed_at === null);
    if (!g.data || !mine) throw notFound("Group not found");
    const rows = must(exp);
    const active = members.filter((m) => m.removed_at === null);

    const total = rows.reduce((s, e) => s + Number(e.amount_paise), 0);
    const spentDays = [...new Set(rows.map((e) => istDay(e.spent_at)))].sort();
    let days = 0;
    if (g.data.starts_on && g.data.ends_on) days = Math.round((Date.parse(g.data.ends_on) - Date.parse(g.data.starts_on)) / 86_400_000) + 1;
    else if (spentDays.length) days = Math.round((Date.parse(spentDays[spentDays.length - 1]!) - Date.parse(spentDays[0]!)) / 86_400_000) + 1;
    days = Math.max(days, 1);

    const paid = new Map<string, { paise: number; count: number }>();
    for (const e of rows) {
      for (const p of e.expense_payers) {
        const cur = paid.get(p.member_id) ?? { paise: 0, count: 0 };
        paid.set(p.member_id, { paise: cur.paise + Number(p.amount_paise), count: cur.count + 1 });
      }
    }
    const top = [...paid.entries()].sort((a, b) => b[1].paise - a[1].paise)[0];
    const topMember = top ? members.find((m) => m.id === top[0]) : undefined;

    const cats = new Map<string, number>();
    for (const e of rows) cats.set(e.category ?? "other", (cats.get(e.category ?? "other") ?? 0) + Number(e.amount_paise));
    const categories = [...cats.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, paise]) => ({ category, percent: total ? Math.round((paise / total) * 100) : 0 }));

    // Your trip personality, from what you logged and paid.
    const loggedByMe = rows.filter((e) => e.created_by === me);
    const myPaid = paid.get(mine.id)?.paise ?? 0;
    const lateNight = loggedByMe.filter((e) => {
      const h = istHour(e.created_at);
      return h >= 23 || h < 4;
    }).length;
    const smallest = loggedByMe.length ? Math.min(...loggedByMe.map((e) => Number(e.amount_paise))) : null;
    const counts = active.map((m) => rows.filter((e) => e.created_by === m.user_id).length);
    const mostLogged = loggedByMe.length > 0 && loggedByMe.length >= Math.max(...counts);
    const myFood = loggedByMe.filter((e) => e.category === "food" || e.category === "drinks").length;
    type Personality = "chai-accountant" | "big-spender" | "night-owl" | "foodie" | "silent-partner" | "trip-treasurer";
    const personality: Personality =
      loggedByMe.length === 0
        ? "silent-partner"
        : top && top[0] === mine.id && myPaid > total * 0.4
          ? "big-spender"
          : lateNight >= 3
            ? "night-owl"
            : mostLogged && smallest !== null && smallest <= 10000
              ? "chai-accountant"
              : myFood > loggedByMe.length / 2
                ? "foodie"
                : "trip-treasurer";

    const big = rows.reduce<Row | null>((b, e) => (!b || Number(e.amount_paise) > Number(b.amount_paise) ? e : b), null);

    return c.json(
      {
        groupId,
        tripName: g.data.name,
        days,
        people: active.length,
        expenseCount: rows.length,
        totalPaise: total,
        perDayPaise: Math.round(total / days),
        perPersonPaise: active.length ? Math.round(total / active.length) : total,
        chaiCount: rows.filter((e) => CHAI.test(e.description)).length,
        topPayer:
          top && topMember
            ? { memberId: top[0], name: topMember.user_id === me ? "You" : topMember.display_name, paidPaise: top[1].paise, count: top[1].count }
            : null,
        me: { memberId: mine.id, personality, logged: loggedByMe.length, paidPaise: myPaid, smallestLoggedPaise: smallest, lateNight },
        categories,
        biggest: big ? { description: big.description, amountPaise: Number(big.amount_paise) } : null,
      },
      200,
    );
  },
);
