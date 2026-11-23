import { createRoute, z } from "@hono/zod-openapi";
import { ApiError } from "../errors.ts";
import { FxRates } from "../schemas.ts";
import { auth, errors, json, router } from "./util.ts";

export const fxRoutes = router();

type Rates = z.infer<typeof FxRates>;

/** Free, keyless sources, tried in order. Both return "units of X per 1 INR", which we invert. */
const SOURCES: { name: string; load: (signal: AbortSignal) => Promise<Omit<Rates, "fetchedAt" | "base">> }[] = [
  {
    name: "open.er-api.com",
    load: async (signal) => {
      const r = await fetch("https://open.er-api.com/v6/latest/INR", { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { result?: string; time_last_update_unix?: number; rates?: Record<string, number> };
      if (j.result !== "success" || !j.rates) throw new Error("bad payload");
      return { inrPer: invert(j.rates), updatedAt: new Date((j.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString(), source: "open.er-api.com" };
    },
  },
  {
    name: "currency-api",
    load: async (signal) => {
      const r = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/inr.json", { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { date?: string; inr?: Record<string, number> };
      if (!j.inr) throw new Error("bad payload");
      const upper = Object.fromEntries(Object.entries(j.inr).map(([k, v]) => [k.toUpperCase(), v]));
      return { inrPer: invert(upper), updatedAt: j.date ? `${j.date}T00:00:00Z` : new Date().toISOString(), source: "currency-api" };
    },
  },
];

/** { USD: 0.0119 } (USD per rupee) -> { USD: 84.03 } (rupees per USD), ISO codes only. */
export function invert(perInr: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, v] of Object.entries(perInr)) {
    if (!/^[A-Z]{3}$/.test(code) || code === "INR" || !(v > 0)) continue;
    out[code] = Number((1 / v).toPrecision(8));
  }
  return out;
}

const FRESH_MS = 30 * 60_000;
let cache: Rates | undefined;
let inflight: Promise<Rates> | undefined;

async function latest(): Promise<Rates> {
  if (cache && Date.now() - Date.parse(cache.fetchedAt) < FRESH_MS) return cache;
  inflight ??= (async () => {
    for (const s of SOURCES) {
      try {
        const got = await s.load(AbortSignal.timeout(6000));
        if (Object.keys(got.inrPer).length < 20) throw new Error("too few rates");
        cache = { base: "INR", ...got, fetchedAt: new Date().toISOString() };
        return cache;
      } catch (e) {
        console.warn(`fx source ${s.name} failed:`, e instanceof Error ? e.message : e);
      }
    }
    // Every source is down: an older copy beats nothing.
    if (cache) return cache;
    throw new ApiError(503, "FX_UNAVAILABLE", "Exchange rates are unavailable right now. Try again in a minute.");
  })().finally(() => (inflight = undefined));
  return inflight;
}

/** Test hook. */
export const resetFxCache = () => {
  cache = undefined;
  inflight = undefined;
};

fxRoutes.openapi(
  createRoute({
    method: "get",
    path: "/fx/rates",
    tags: ["fx"],
    summary: "Latest exchange rates into rupees",
    description: "Rupees per one unit of each currency, from free public sources (refreshed every 30 minutes; the sources publish daily).",
    ...auth,
    responses: { 200: json(FxRates, "Rates"), 503: json(z.object({ error: z.object({ code: z.string(), message: z.string() }) }), "No source answered"), ...errors },
  }),
  async (c) => {
    const rates = await latest();
    c.header("Cache-Control", "private, max-age=1800");
    return c.json(rates, 200);
  },
);
