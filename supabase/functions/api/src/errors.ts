import { MoneyError } from "@lets-split/core";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Every error response looks like { error: { code, message, details? } }. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = "Not found") => new ApiError(404, "NOT_FOUND", what);

interface PgError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** Turn a PostgREST / Postgres error into an ApiError with a sensible status. */
export function fromPg(e: PgError): ApiError {
  switch (e.code) {
    case "PGRST116":
    case "P0002":
      return notFound();
    case "42501":
      return new ApiError(403, "FORBIDDEN", "You don't have access to that.");
    case "23505":
      return new ApiError(409, "CONFLICT", "That already exists.");
    case "23503":
      return new ApiError(422, "INVALID_REFERENCE", "Someone or something in the request isn't part of this group.");
    case "23514":
    case "22P02":
    case "22023":
      return new ApiError(422, "INVALID", e.message ?? "Invalid value.");
    default:
      return new ApiError(500, "DB_ERROR", "Something went wrong on our side.", { pg: e.code });
  }
}

/** Throw if a Supabase call failed; return its data otherwise. */
export function must<T>(res: { data: T; error: PgError | null }): NonNullable<T> {
  if (res.error) throw fromPg(res.error);
  if (res.data === null || res.data === undefined) throw notFound();
  return res.data as NonNullable<T>;
}

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function handleError(err: Error, c: Context) {
  if (err instanceof ApiError) return c.json(errorBody(err.code, err.message, err.details), err.status);
  if (err instanceof MoneyError) return c.json(errorBody(err.code, err.message), 422);
  if (err instanceof HTTPException) return c.json(errorBody("HTTP_ERROR", err.message), err.status);
  console.error("unhandled", err);
  return c.json(errorBody("INTERNAL", "Something went wrong on our side."), 500);
}
