// Local dev server for the API under Deno, the same runtime as Supabase Edge Functions.
// `pnpm dev:api` from the repo root. The web app's Vite proxy forwards /functions/v1/* here.
import { createApp } from "./src/app.ts";

const port = Number(Deno.env.get("PORT") ?? 8787);
Deno.serve({ port, hostname: "127.0.0.1" }, createApp().fetch);
