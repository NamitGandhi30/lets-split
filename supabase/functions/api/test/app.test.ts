// Fast tests with no network: routing, auth guard, validation, OpenAPI.
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { toSplitSpec } from "../src/routes/expenses.ts";

const env = () => ({ supabaseUrl: "http://127.0.0.1:1", supabaseKey: "test", allowedOrigins: ["*"] });
const app = createApp({ env, verify: async (_e, jwt) => (jwt === "good" ? { id: "11111111-1111-4111-8111-111111111111", email: "a@b.c" } : null) });
const authed = { authorization: "Bearer good", "content-type": "application/json" };

describe("public endpoints", () => {
  it("health", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("publishes an OpenAPI 3.1 document with every v1 route", async () => {
    const res = await app.request("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, unknown> } };
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        "/api/v1/expenses/{expenseId}",
        "/api/v1/groups",
        "/api/v1/groups/{groupId}",
        "/api/v1/groups/{groupId}/balances",
        "/api/v1/groups/{groupId}/expenses",
        "/api/v1/groups/{groupId}/members",
        "/api/v1/groups/{groupId}/members/{memberId}",
        "/api/v1/me",
      ].sort(),
    );
    expect(Object.keys(doc.paths["/api/v1/groups/{groupId}/expenses"]!).sort()).toEqual(["get", "post"]);
    expect(doc.components.schemas).toHaveProperty("ExpenseCreate");
    expect(doc.components.schemas).toHaveProperty("Balances");
  });

  it("answers CORS preflight", async () => {
    const res = await app.request("/api/v1/me", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:5173", "access-control-request-method": "GET", "access-control-request-headers": "authorization" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("unknown paths are JSON 404s", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("auth guard", () => {
  it("rejects missing and bad tokens", async () => {
    expect((await app.request("/api/v1/me")).status).toBe(401);
    const res = await app.request("/api/v1/me", { headers: { authorization: "Bearer forged" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});

describe("validation (rejected before touching the database)", () => {
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", headers: { ...authed, ...headers }, body: JSON.stringify(body) });

  it("rejects a non-uuid group id in the path", async () => {
    const res = await app.request("/api/v1/groups/not-a-uuid", { headers: authed });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "VALIDATION" } });
  });

  it("rejects bad expense payloads", async () => {
    const g = "/api/v1/groups/22222222-2222-4222-8222-222222222222/expenses";
    const base = { id: "33333333-3333-4333-8333-333333333333", description: "Dinner", amountPaise: 1000, split: { type: "equal", members: ["44444444-4444-4444-8444-444444444444"] } };
    for (const bad of [
      { ...base, amountPaise: 10.5 },
      { ...base, amountPaise: 0 },
      { ...base, amountPaise: -100 },
      { ...base, description: "" },
      { ...base, id: "nope" },
      { ...base, split: { type: "magic" } },
      { ...base, split: { type: "equal", members: [] } },
      { ...base, extra: true },
    ]) {
      const res = await post(g, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      const body = (await res.json()) as { error: { code: string; details: unknown[] } };
      expect(body.error.code).toBe("VALIDATION");
      expect(body.error.details.length).toBeGreaterThan(0);
    }
  });

  it("rejects bad group payloads and UPI IDs", async () => {
    expect((await post("/api/v1/groups", { id: "33333333-3333-4333-8333-333333333333", name: "" })).status).toBe(400);
    expect((await post("/api/v1/groups", { id: "33333333-3333-4333-8333-333333333333", name: "Goa", accent: "yellow" })).status).toBe(400);
    const res = await app.request("/api/v1/me", { method: "PATCH", headers: authed, body: JSON.stringify({ upiId: "not a vpa" }) });
    expect(res.status).toBe(400);
  });

  it("rejects a non-uuid Idempotency-Key", async () => {
    const res = await post("/api/v1/groups", { id: "33333333-3333-4333-8333-333333333333", name: "Goa" }, { "idempotency-key": "abc" });
    expect(res.status).toBe(400);
  });
});

describe("toSplitSpec", () => {
  it("maps API arrays to core records, preserving order", () => {
    expect(toSplitSpec({ type: "percent", percents: [{ memberId: "b", percent: 60 }, { memberId: "a", percent: 40 }] })).toEqual({
      type: "percent",
      percents: { b: 60, a: 40 },
    });
    expect(toSplitSpec({ type: "adjustment", members: ["a", "b"], adjustments: [{ memberId: "a", amountPaise: 100 }] })).toEqual({
      type: "adjustment",
      members: ["a", "b"],
      adjustments: { a: 100 },
    });
  });
});
