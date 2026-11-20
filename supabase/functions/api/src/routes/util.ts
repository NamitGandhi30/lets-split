import { OpenAPIHono, type Hook } from "@hono/zod-openapi";
import type { AppEnv } from "../context.ts";
import { errorBody } from "../errors.ts";
import { ErrorSchema } from "../schemas.ts";

export const json = <T>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

export const body = <T>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});

export const errors = {
  400: json(ErrorSchema, "Invalid request"),
  401: json(ErrorSchema, "Not signed in"),
  404: json(ErrorSchema, "Not found, or not a member of this group"),
  422: json(ErrorSchema, "The request doesn't add up"),
};

export const auth = { security: [{ Bearer: [] }] };

/** Validation failures become { error: { code: "VALIDATION", details: [{ path, message }] } } with 400. */
// deno-lint-ignore no-explicit-any
export const validationHook: Hook<any, AppEnv, any, any> = (result, c) => {
  if (!result.success) {
    return c.json(
      errorBody(
        "VALIDATION",
        "Some fields are missing or invalid.",
        result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      ),
      400,
    );
  }
};

export const router = () => new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
