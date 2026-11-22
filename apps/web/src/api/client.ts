import createClient, { type Middleware } from "openapi-fetch";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";
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

const auth: Middleware = {
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

/** Typed client generated from /api/v1/openapi.json (pnpm gen:api). */
export const api = createClient<paths>({ baseUrl: env.apiBase });
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
