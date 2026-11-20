// Supabase Edge Function entrypoint. All routes live in src/app.ts so they can be tested in Node.
import { createApp } from "./src/app.ts";

const app = createApp();
Deno.serve(app.fetch);
