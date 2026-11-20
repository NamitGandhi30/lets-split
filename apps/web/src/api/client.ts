import createClient, { type Middleware } from "openapi-fetch";
import { env } from "../lib/env";
import { supabase } from "../lib/supabase";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Group = Schemas["Group"];
export type Member = Schemas["Member"];
export type Expense = Schemas["Expense"];
export type Balances = Schemas["Balances"];
export type Me = Schemas["Me"];

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
