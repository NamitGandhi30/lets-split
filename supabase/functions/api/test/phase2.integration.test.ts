// Phase 2 end-to-end against the real Supabase project with alice and bob: invites, claiming a
// placeholder, every split type, edits, comments, settlements and alerts. Skipped without .env.test.local.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";

const envPath = fileURLToPath(new URL("../../../../.env.test.local", import.meta.url));
const E: Record<string, string> = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, "utf8").trim().split(/\r?\n/).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    )
  : {};
const enabled = Boolean(E.SUPABASE_URL && E.TEST_ALICE_PASSWORD);
const app = createApp({ env: () => ({ supabaseUrl: E.SUPABASE_URL!, supabaseKey: E.SUPABASE_PUBLISHABLE_KEY!, allowedOrigins: ["*"] }) });

type Who = { token: string; client: SupabaseClient };
async function signIn(email: string, password: string): Promise<Who> {
  const client = createClient(E.SUPABASE_URL!, E.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { token: data.session!.access_token, client };
}
const call = (who: Who, method: string, path: string, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${who.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
// deno-lint-ignore no-explicit-any
type J = Record<string, any>;
const j = async (r: Response) => (await r.json()) as J;

describe.skipIf(!enabled)("phase 2 flow (two accounts)", () => {
  let alice: Who;
  let bob: Who;
  const groupId = crypto.randomUUID();
  let a = "";
  let ph = "";
  let code = "";
  const exp = crypto.randomUUID();

  beforeAll(async () => {
    alice = await signIn(E.TEST_ALICE_EMAIL!, E.TEST_ALICE_PASSWORD!);
    bob = await signIn(E.TEST_BOB_EMAIL!, E.TEST_BOB_PASSWORD!);
    await call(alice, "POST", "/activity/seen");
  });
  afterAll(async () => {
    if (alice) await alice.client.from("groups").delete().eq("id", groupId);
  });

  it("alice creates a trip with a placeholder and rotates the invite", async () => {
    const g = await j(await call(alice, "POST", "/groups", { id: groupId, name: "Manali test", accent: "#3FD0B6" }));
    a = g.myMemberId;
    ph = (await j(await call(alice, "POST", `/groups/${groupId}/members`, { displayName: "Bobby" }))).id;
    const r = await call(alice, "POST", `/groups/${groupId}/invite`);
    expect(r.status).toBe(200);
    code = (await j(r)).inviteCode;
    expect(code).not.toBe(g.inviteCode);
    expect((await call(bob, "GET", `/invites/${g.inviteCode}`)).status).toBe(404);
  });

  it("bob previews the invite and claims the placeholder, keeping its history", async () => {
    const p = await j(await call(bob, "GET", `/invites/${code}`));
    expect(p).toMatchObject({ name: "Manali test", alreadyMember: false });
    expect(p.members.find((m: J) => m.id === ph).isPlaceholder).toBe(true);
    const pre = await call(alice, "POST", `/groups/${groupId}/expenses`, {
      id: exp, description: "Cab", amountPaise: 1000, split: { type: "equal", members: [a, ph] },
    });
    expect(pre.status).toBe(201);

    const join = await call(bob, "POST", `/invites/${code}/join`, { claimMemberId: ph });
    expect(join.status).toBe(200);
    expect(await j(join)).toMatchObject({ groupId, memberId: ph, alreadyMember: false });
    expect((await j(await call(bob, "POST", `/invites/${code}/join`, {}))).alreadyMember).toBe(true);
    const bal = await j(await call(bob, "GET", `/groups/${groupId}/balances`));
    expect(bal.me).toEqual({ memberId: ph, netPaise: -500 });
    const members = await j(await call(bob, "GET", `/groups/${groupId}/members`));
    expect(members.items.find((m: J) => m.id === a).upiId).toBe("alice@okaxis");
  });

  it("bob adds each split type, and an expense with two payers", async () => {
    const splits = [
      { type: "exact", amounts: [{ memberId: a, amountPaise: 700 }, { memberId: ph, amountPaise: 300 }] },
      { type: "percent", percents: [{ memberId: a, percent: 60 }, { memberId: ph, percent: 40 }] },
      { type: "shares", shares: [{ memberId: a, weight: 2 }, { memberId: ph, weight: 1 }] },
      { type: "adjustment", members: [a, ph], adjustments: [{ memberId: a, amountPaise: 100 }] },
    ];
    for (const split of splits) {
      const r = await call(bob, "POST", `/groups/${groupId}/expenses`, { id: crypto.randomUUID(), description: split.type, amountPaise: 1000, split });
      expect(r.status, split.type).toBe(201);
    }
    const two = await call(bob, "POST", `/groups/${groupId}/expenses`, {
      id: crypto.randomUUID(), description: "Two payers", amountPaise: 1000,
      payers: [{ memberId: a, amountPaise: 400 }, { memberId: ph, amountPaise: 600 }], split: { type: "equal", members: [a, ph] },
    });
    expect(two.status).toBe(201);
  });

  it("edit, history, comments, delete and restore", async () => {
    const put = await call(alice, "PUT", `/expenses/${exp}`, { description: "Cab to Solang", amountPaise: 2000, split: { type: "equal", members: [a, ph] } });
    expect(put.status).toBe(200);
    expect((await j(put)).shares.map((s: J) => s.amountPaise)).toEqual([1000, 1000]);
    const h = await j(await call(bob, "GET", `/expenses/${exp}/history`));
    expect(h.items.map((x: J) => x.op)).toEqual(["insert", "update"]);
    expect(h.items[1].changes).toEqual(expect.arrayContaining(["name", "amount"]));
    expect((await call(bob, "POST", `/expenses/${exp}/comments`, { body: "worth it" })).status).toBe(201);
    expect((await j(await call(alice, "GET", `/expenses/${exp}/comments`))).items[0]).toMatchObject({ body: "worth it", authorName: "Bobby" });
    expect((await call(bob, "DELETE", `/expenses/${exp}`)).status).toBe(200);
    expect((await call(alice, "PUT", `/expenses/${exp}`, { description: "x", amountPaise: 1, split: { type: "equal", members: [a] } })).status).toBe(409);
    const rs = await call(bob, "POST", `/expenses/${exp}/restore`);
    expect(rs.status).toBe(200);
    expect((await j(rs)).deletedAt).toBeNull();
  });

  it("settles up: idempotent create, balances move, undo works", async () => {
    const before = await j(await call(bob, "GET", `/groups/${groupId}/balances`));
    expect(before.transfers).toHaveLength(1);
    const t = before.transfers[0];
    expect(t).toMatchObject({ from: a, to: ph });
    const owe = t.amountPaise;
    expect(before.me.netPaise).toBe(owe);
    const body = { id: crypto.randomUUID(), fromMemberId: t.from, toMemberId: t.to, amountPaise: owe, method: "upi" };
    expect((await call(bob, "POST", `/groups/${groupId}/settlements`, body)).status).toBe(201);
    expect((await call(bob, "POST", `/groups/${groupId}/settlements`, body)).status).toBe(200);
    const after = await j(await call(bob, "GET", `/groups/${groupId}/balances`));
    expect(after.me.netPaise).toBe(0);
    expect(after.transfers).toEqual([]);
    expect((await j(await call(alice, "GET", `/groups/${groupId}/settlements`))).items).toHaveLength(1);
    expect((await call(bob, "DELETE", `/settlements/${body.id}`)).status).toBe(200);
    expect((await j(await call(bob, "GET", `/groups/${groupId}/balances`))).me.netPaise).toBe(owe);
    await call(bob, "POST", `/groups/${groupId}/settlements`, { ...body, id: crypto.randomUUID() });
  });

  it("stats: totals, days, categories and who paid all add up", async () => {
    const r = await call(bob, "GET", `/groups/${groupId}/stats`);
    expect(r.status).toBe(200);
    const st = await j(r);
    expect(st.totalSpentPaise).toBe(7000); // cab 2000 + four 1000s + two payers 1000
    expect(st.expenseCount).toBe(6);
    expect(st.days.reduce((s: number, d: J) => s + d.paise, 0)).toBe(7000);
    expect(st.categories.reduce((s: number, c: J) => s + c.paise, 0)).toBe(7000);
    expect(st.paidBy.reduce((s: number, p: J) => s + p.paise, 0)).toBe(7000);
    expect(st.me.memberId).toBe(ph);
    expect(st.biggest.description).toBe("Cab to Solang");
    expect((await call(bob, "GET", `/groups/${crypto.randomUUID()}/stats`)).status).toBe(404);
  });

  it("wrapped: real numbers for the five stories", async () => {
    const w = await j(await call(bob, "GET", `/groups/${groupId}/wrapped`));
    expect(w).toMatchObject({ tripName: "Manali test", people: 2, expenseCount: 6, totalPaise: 7000 });
    expect(w.categories.length).toBeGreaterThan(0);
    expect(w.topPayer.paidPaise).toBeGreaterThan(0);
    expect(w.me.memberId).toBe(ph);
    expect(w.me.logged).toBe(5);
  });

  it("alerts: alice sees bob's actions as unread; marking seen clears them", async () => {
    const f = await j(await call(alice, "GET", `/activity?groupId=${groupId}`));
    const kinds = f.items.map((i: J) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["member.claimed", "expense.added", "comment.added", "settlement.added"]));
    expect(f.unreadCount).toBeGreaterThan(0);
    const settle = f.items.find((i: J) => i.kind === "settlement.added");
    expect(settle.data).toMatchObject({ fromName: "you", fromMe: true, toName: "Bobby" });
    expect(f.items.filter((i: J) => i.isMine).every((i: J) => !i.unread)).toBe(true);
    await call(alice, "POST", "/activity/seen");
    expect((await j(await call(alice, "GET", `/activity?groupId=${groupId}`))).unreadCount).toBe(0);
  });

  it("archiving stops new joins; strangers get 404", async () => {
    const r = await call(alice, "POST", `/groups/${groupId}/archive`, { archived: true });
    expect((await j(r)).archivedAt).not.toBeNull();
    const stranger = crypto.randomUUID();
    expect((await call(bob, "POST", `/groups/${stranger}/invite`)).status).toBe(404);
    expect((await call(bob, "GET", `/groups/${stranger}/settlements`)).status).toBe(404);
    expect((await call(bob, "POST", `/groups/${stranger}/settlements`, { id: crypto.randomUUID(), fromMemberId: ph, toMemberId: a, amountPaise: 1 })).status).toBe(404);
  });
});
