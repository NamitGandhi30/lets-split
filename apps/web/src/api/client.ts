import createClient, { type Middleware } from "openapi-fetch";
import { env } from "../lib/env";
import { storedSession, supabase } from "../lib/supabase";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Group = Schemas["Group"];
export type Member = Schemas["GroupMember"];
export type Expense = Schemas["Expense"];
export type ExpenseCreate = Schemas["ExpenseCreate"];
export type SplitInput = Schemas["SplitInput"];
export type Balances = Schemas["Balances"];
export type Me = Schemas["Me"];
export type Settlement = Schemas["Settlement"];
export type ActivityItem = Schemas["ActivityItem"];
export type InvitePreview = Schemas["InvitePreview"];
export type Comment = Schemas["Comment"];
export type HistoryEntry = Schemas["HistoryEntry"];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** A request that never reached the API, or got no answer in time. Always worth retrying. */
export class NetworkError extends Error {}

const auth: Middleware = {
  async onRequest({ request }) {
    // Plainly offline: fail now, rather than wait out Supabase's ~30s of token-renewal retries.
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new NetworkError("No connection");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    // Still signed in, but the token couldn't be renewed (no network). Sending the request without
    // it would come back 401 and a queued write would be dropped as if it were rejected.
    else if (storedSession()) throw new NetworkError("Waiting for a connection");
    return request;
  },
};

/**
 * On one bar of signal a request can hang for a minute or more. Give up after 20s so the retry
 * starts over; writes carry an Idempotency-Key, so a slow first attempt that did land is not doubled.
 */
const TIMEOUT_MS = 20_000;
async function fetchWithTimeout(request: Request): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  request.signal?.addEventListener("abort", () => ctrl.abort());
  try {
    return await fetch(request, { signal: ctrl.signal });
  } catch (e) {
    throw new NetworkError(ctrl.signal.aborted ? "The connection is too slow" : e instanceof Error ? e.message : "No connection");
  } finally {
    clearTimeout(timer);
  }
}

/** Typed client generated from /api/v1/openapi.json (pnpm gen:api). */
export const api = createClient<paths>({ baseUrl: env.apiBase, fetch: fetchWithTimeout });
api.use(auth);

/** Unwrap an openapi-fetch result or throw an ApiError with the API's error code. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || data === undefined) {
    const e = (error as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(response.status, e?.code ?? "HTTP_" + response.status, e?.message ?? response.statusText);
  }
  return data;
}

/** Idempotency-Key header: the same key is resent on every retry of one user action. */
export const idem = (key: string) => ({ headers: { "idempotency-key": key } });
export type TripStats = Schemas["TripStats"];
export type WrappedData = Schemas["Wrapped"];
