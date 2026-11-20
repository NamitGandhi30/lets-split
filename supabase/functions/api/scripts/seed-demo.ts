// Seeds three demo trips (Goa, Manali, Jaipur) for the alice test account through the API.
// Usage: node --experimental-strip-types scripts/seed-demo.ts [apiBase]
//   apiBase defaults to the local dev API, http://127.0.0.1:8787/api/v1
// Re-running is safe: every group and expense id is derived from a fixed seed, so replays are no-ops.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const E = Object.fromEntries(
  readFileSync(new URL("../../../../.env.test.local", import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const API = process.argv[2] ?? "http://127.0.0.1:8787/api/v1";

/** Deterministic UUID (v4-shaped) from a label, so the seed is idempotent. */
const id = (label: string) => {
  const h = createHash("sha256").update("lets-split-demo:" + label).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const sb = createClient(E.SUPABASE_URL, E.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error } = await sb.auth.signInWithPassword({ email: E.TEST_ALICE_EMAIL, password: E.TEST_ALICE_PASSWORD });
if (error) throw error;
const token = auth.session!.access_token;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

const day = (offset: number, h = 13) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(h, 20, 0, 0);
  return d.toISOString();
};

type Trip = {
  key: string;
  name: string;
  accent: string;
  location: string;
  days: number;
  people: string[];
  expenses: { d: string; amt: number; payer: string; cat: string; ago: number; split?: "all" | string[] }[];
};

const trips: Trip[] = [
  {
    key: "jaipur", name: "Jaipur weekend", accent: "#5C8DFF", location: "Jaipur", days: 2, people: ["Kabir", "Diya", "Meera"],
    expenses: [
      { d: "Haveli stay", amt: 640000, payer: "Meera", cat: "stay", ago: 2 },
      { d: "Chokhi Dhani dinner", amt: 396000, payer: "Diya", cat: "food", ago: 2 },
      { d: "Lassiwala", amt: 32000, payer: "me", cat: "food", ago: 0 },
      { d: "Amber Fort tickets", amt: 160000, payer: "Kabir", cat: "fun", ago: 0 },
    ],
  },
  {
    key: "manali", name: "Manali cousins", accent: "#3FD0B6", location: "Manali", days: 9, people: ["Diya", "Kabir", "Meera", "Rohan"],
    expenses: [
      { d: "Homestay, 4 nights", amt: 1800000, payer: "Meera", cat: "stay", ago: 4 },
      { d: "Paragliding at Solang", amt: 1400000, payer: "Kabir", cat: "fun", ago: 3 },
      { d: "Volvo to Manali", amt: 750000, payer: "me", cat: "travel", ago: 2 },
      { d: "Café 1947", amt: 294050, payer: "Diya", cat: "food", ago: 0 },
    ],
  },
  {
    key: "goa", name: "Goa '26", accent: "#F4D23C", location: "Goa", days: 4, people: ["Diya", "Kabir", "Meera", "Rohan", "Aanya"],
    expenses: [
      { d: "Villa, 3 nights", amt: 2100000, payer: "Meera", cat: "stay", ago: 3 },
      { d: "Curlies sunset drinks", amt: 465000, payer: "Kabir", cat: "drinks", ago: 1 },
      { d: "Scooter rentals", amt: 1120000, payer: "me", cat: "travel", ago: 0, split: ["me", "Diya", "Kabir", "Meera"] },
      { d: "Beach shack lunch", amt: 318000, payer: "Diya", cat: "food", ago: 0 },
    ],
  },
];

for (const t of trips) {
  const gid = id(`group:${t.key}`);
  const start = new Date();
  start.setDate(start.getDate() - (t.days - 1));
  const g = await call<{ myMemberId: string }>("POST", "/groups", {
    id: gid, name: t.name, accent: t.accent, location: t.location,
    startsOn: start.toISOString().slice(0, 10), endsOn: new Date().toISOString().slice(0, 10),
  });
  const { items } = await call<{ items: { id: string; displayName: string; isMe: boolean }[] }>("GET", `/groups/${gid}/members`);
  const ids: Record<string, string> = { me: g.myMemberId };
  for (const name of t.people) {
    const found = items.find((m) => m.displayName === name);
    ids[name] = found ? found.id : (await call<{ id: string }>("POST", `/groups/${gid}/members`, { displayName: name })).id;
  }
  for (const e of t.expenses) {
    const members = e.split && e.split !== "all" ? e.split.map((n) => ids[n]!) : Object.values(ids);
    await call("POST", `/groups/${gid}/expenses`, {
      id: id(`expense:${t.key}:${e.d}`), description: e.d, amountPaise: e.amt, category: e.cat, spentAt: day(e.ago),
      payers: [{ memberId: ids[e.payer]!, amountPaise: e.amt }],
      split: { type: "equal", members },
    });
  }
  const b = await call<{ me: { netPaise: number } }>("GET", `/groups/${gid}/balances`);
  console.log(`${t.name}: ${t.expenses.length} expenses, alice net ${b.me.netPaise} paise`);
}
