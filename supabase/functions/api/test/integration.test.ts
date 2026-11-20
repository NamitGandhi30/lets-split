// End-to-end against the real Supabase project with two real accounts (alice and bob).
// Runs only when .env.test.local exists at the repo root (it's gitignored). The API runs
// in-process and talks to Postgres with each user's JWT, so row level security is exercised.
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

const env = () => ({ supabaseUrl: E.SUPABASE_URL!, supabaseKey: E.SUPABASE_PUBLISHABLE_KEY!, allowedOrigins: ["*"] });
const app = createApp({ env });

type Who = { token: string; client: SupabaseClient };
async function signIn(email: string, password: string): Promise<Who> {
  const client = createClient(E.SUPABASE_URL!, E.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { token: data.session!.access_token, client };
}

function call(who: Who, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${who.token}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe.skipIf(!enabled)("API against Supabase (two accounts)", () => {
  let alice: Who;
  let bob: Who;
  const groupId = crypto.randomUUID();
  let aliceMember = "";
  let rohan = "";
  let meera = "";
  const dinner = crypto.randomUUID();

  beforeAll(async () => {
    alice = await signIn(E.TEST_ALICE_EMAIL!, E.TEST_ALICE_PASSWORD!);
    bob = await signIn(E.TEST_BOB_EMAIL!, E.TEST_BOB_PASSWORD!);
  });

  afterAll(async () => {
    // Owners may delete their group; everything inside cascades.
    if (alice) await alice.client.from("groups").delete().eq("id", groupId);
  });

  it("GET /me returns the profile created at sign-up", async () => {
    const res = await call(alice, "GET", "/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: E.TEST_ALICE_EMAIL, displayName: "Alice" });
  });

  it("PATCH /me validates and saves a UPI ID", async () => {
    const res = await call(alice, "PATCH", "/me", { upiId: "Alice@OKAXIS" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ upiId: "alice@okaxis", noUpi: false });
  });

  it("POST /groups creates a group with the caller as owner; replaying the id is safe", async () => {
    const body = { id: groupId, name: "Goa '26", accent: "#F4D23C", location: "Goa" };
    const first = await call(alice, "POST", "/groups", body);
    expect(first.status).toBe(201);
    const g = (await first.json()) as { myMemberId: string; memberCount: number; inviteCode: string };
    expect(g).toMatchObject({ name: "Goa '26", memberCount: 1, totalSpentPaise: 0 });
    aliceMember = g.myMemberId;
    const again = await call(alice, "POST", "/groups", body);
    expect(again.status).toBe(201);
    expect(((await again.json()) as { myMemberId: string }).myMemberId).toBe(aliceMember);
  });

  it("adds placeholder members; an Idempotency-Key replay doesn't add twice", async () => {
    const key = crypto.randomUUID();
    const r1 = await call(alice, "POST", `/groups/${groupId}/members`, { displayName: "Rohan" }, { "idempotency-key": key });
    expect(r1.status).toBe(201);
    const m1 = (await r1.json()) as { id: string; isPlaceholder: boolean };
    expect(m1.isPlaceholder).toBe(true);
    rohan = m1.id;
    const r2 = await call(alice, "POST", `/groups/${groupId}/members`, { displayName: "Rohan" }, { "idempotency-key": key });
    expect(r2.status).toBe(201);
    expect(r2.headers.get("idempotent-replayed")).toBe("true");
    expect(((await r2.json()) as { id: string }).id).toBe(rohan);

    const r3 = await call(alice, "POST", `/groups/${groupId}/members`, { displayName: "Meera" });
    meera = ((await r3.json()) as { id: string }).id;
    const list = (await (await call(alice, "GET", `/groups/${groupId}/members`)).json()) as { items: unknown[] };
    expect(list.items).toHaveLength(3);
  });

  it("POST expense: equal split computed on the server; replaying the id returns 200 with no duplicate", async () => {
    const body = { id: dinner, description: "Dinner at Thalassa", amountPaise: 100000, split: { type: "equal", members: [aliceMember, rohan, meera] } };
    const res = await call(alice, "POST", `/groups/${groupId}/expenses`, body);
    expect(res.status).toBe(201);
    const e = (await res.json()) as { shares: { memberId: string; amountPaise: number }[]; payers: unknown[] };
    expect(e.shares.map((s) => s.amountPaise).sort()).toEqual([33333, 33333, 33334]);
    expect(e.payers).toEqual([{ memberId: aliceMember, amountPaise: 100000 }]);

    const replay = await call(alice, "POST", `/groups/${groupId}/expenses`, body);
    expect(replay.status).toBe(200);
    const page = (await (await call(alice, "GET", `/groups/${groupId}/expenses`)).json()) as { items: unknown[] };
    expect(page.items).toHaveLength(1);
  });

  it("POST expense: multiple payers with a percent split", async () => {
    const res = await call(alice, "POST", `/groups/${groupId}/expenses`, {
      id: crypto.randomUUID(),
      description: "Scooters",
      amountPaise: 300000,
      payers: [{ memberId: aliceMember, amountPaise: 200000 }, { memberId: rohan, amountPaise: 100000 }],
      split: { type: "percent", percents: [{ memberId: aliceMember, percent: 50 }, { memberId: rohan, percent: 25 }, { memberId: meera, percent: 25 }] },
    });
    expect(res.status).toBe(201);
  });

  it("rejects splits that don't add up, and members from outside the group", async () => {
    const bad = await call(alice, "POST", `/groups/${groupId}/expenses`, {
      id: crypto.randomUUID(), description: "x", amountPaise: 1000,
      split: { type: "exact", amounts: [{ memberId: aliceMember, amountPaise: 900 }] },
    });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ error: { code: "SPLIT_MISMATCH" } });

    const stranger = await call(alice, "POST", `/groups/${groupId}/expenses`, {
      id: crypto.randomUUID(), description: "x", amountPaise: 1000, split: { type: "equal", members: [crypto.randomUUID()] },
    });
    expect(stranger.status).toBe(422);
    expect(await stranger.json()).toMatchObject({ error: { code: "UNKNOWN_MEMBER" } });
  });

  it("GET balances: nets add to zero and the simplified plan has at most n − 1 payments", async () => {
    const res = await call(alice, "GET", `/groups/${groupId}/balances`);
    expect(res.status).toBe(200);
    const b = (await res.json()) as { nets: { memberId: string; netPaise: number }[]; transfers: unknown[]; me: { netPaise: number }; totalSpentPaise: number };
    expect(b.nets.reduce((s, n) => s + n.netPaise, 0)).toBe(0);
    expect(b.totalSpentPaise).toBe(400000);
    // alice paid 1000 + 2000, owes 333.34 + 1500 -> +1166.66
    expect(b.me.netPaise).toBe(300000 - 33334 - 150000);
    expect(b.transfers.length).toBeLessThanOrEqual(2);
    const raw = (await (await call(alice, "GET", `/groups/${groupId}/balances?simplify=false`)).json()) as { simplified: boolean };
    expect(raw.simplified).toBe(false);
  });

  it("bob, who isn't a member, gets 404 for everything in alice's group", async () => {
    expect((await call(bob, "GET", `/groups/${groupId}`)).status).toBe(404);
    expect((await call(bob, "GET", `/groups/${groupId}/members`)).status).toBe(404);
    expect((await call(bob, "GET", `/groups/${groupId}/expenses`)).status).toBe(404);
    expect((await call(bob, "GET", `/groups/${groupId}/balances`)).status).toBe(404);
    expect((await call(bob, "GET", `/expenses/${dinner}`)).status).toBe(404);
    expect((await call(bob, "DELETE", `/expenses/${dinner}`)).status).toBe(404);
    expect((await call(bob, "POST", `/groups/${groupId}/members`, { displayName: "Sneaky" })).status).toBe(404);
    const groups = (await (await call(bob, "GET", "/groups")).json()) as { items: { id: string }[] };
    expect(groups.items.map((g) => g.id)).not.toContain(groupId);
  });

  it("bob can't touch alice's tables directly through PostgREST either", async () => {
    const { data } = await bob.client.from("expenses").select("id").eq("group_id", groupId);
    expect(data).toEqual([]);
    const { error } = await bob.client.from("group_members").insert({ group_id: groupId, user_id: null, display_name: "x" });
    expect(error?.code).toBe("42501");
  });

  it("DELETE soft-deletes, twice is fine, and balances drop it", async () => {
    const d1 = await call(alice, "DELETE", `/expenses/${dinner}`);
    expect(d1.status).toBe(200);
    expect((await call(alice, "DELETE", `/expenses/${dinner}`)).status).toBe(200);
    const b = (await (await call(alice, "GET", `/groups/${groupId}/balances`)).json()) as { totalSpentPaise: number };
    expect(b.totalSpentPaise).toBe(300000);
  });
});
