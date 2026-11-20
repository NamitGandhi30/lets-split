// Writes the OpenAPI document to supabase/functions/api/openapi.json (used to generate the web client).
import { writeFileSync } from "node:fs";
import { createApp } from "../src/app.ts";

const app = createApp({
  env: () => ({ supabaseUrl: "http://localhost", supabaseKey: "unused", allowedOrigins: ["*"] }),
  verify: async () => null,
});
const res = await app.request("/api/v1/openapi.json");
if (res.status !== 200) throw new Error(`openapi.json returned ${res.status}: ${await res.text()}`);
const out = new URL("../openapi.json", import.meta.url);
writeFileSync(out, JSON.stringify(await res.json(), null, 2) + "\n");
console.log("wrote", out.pathname);
