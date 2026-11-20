# Let's Split

A free, personal Splitwise replacement for trips: an installable PWA (iPhone first), with INR and UPI.
Decisions live in [docs/BUILD-BRIEF.md](docs/BUILD-BRIEF.md). The approved design is the Figma file
linked there, plus [design/prototype.template.html](design/prototype.template.html) for motion.

## Layout

| Path | What |
|---|---|
| `packages/core` | Pure TS money math, no dependencies: paise, largest-remainder rounding, 5 split types + multiple payers, itemized receipts, balances, greedy debt simplification, UPI links, WhatsApp summary. Vitest. |
| `supabase/migrations` | Schema, RLS (`private.is_group_member()`), triggers (profiles, activity, history, expense totals), RPCs. |
| `supabase/tests` | `rls_two_accounts.sql`: RLS check with two real accounts (always rolls back). |
| `supabase/functions/api` | REST API `/v1` on a Supabase Edge Function: Hono + zod-openapi, spec at `/api/v1/openapi.json`. Talks to Postgres with the caller's JWT. |
| `apps/web` | Static SPA: Vite + React 19 + Tailwind v4 + React Router + TanStack Query + vite-plugin-pwa. Typed API client generated from the OpenAPI spec. |

## Develop

Requirements: Node 22+ and pnpm 10. Deno comes from the API package's devDependencies.

```sh
pnpm install
cp apps/web/.env.example apps/web/.env.local                  # public Supabase URL + publishable key
cp supabase/functions/.env.example supabase/functions/.env.local
pnpm dev            # API under Deno on :8787 + web on :5173 (Vite proxies /functions/v1 to the API)
```

Open http://localhost:5173 and sign in with an email code. Email setup is in
[docs/SETUP-AUTH.md](docs/SETUP-AUTH.md).

| Command | Does |
|---|---|
| `pnpm test` | core unit tests + API tests. API integration tests run against Supabase when `.env.test.local` exists. |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm gen:api` | Re-export `openapi.json` from the API and regenerate `apps/web/src/api/schema.d.ts` |
| `pnpm build` | Production build of the PWA into `apps/web/dist` |
| `pnpm --filter @lets-split/api check` | `deno check` the Edge Function entrypoint |
| `pnpm --filter @lets-split/web gen:icons` | Re-render app icons with headless Edge/Chrome |

### Test accounts

`.env.test.local` (gitignored) holds two test accounts, `alice@lets-split.test` and
`bob@lets-split.test`, plus the public project URL/key. The API integration tests and
`supabase/functions/api/scripts/seed-demo.ts` (three demo trips for alice) use them.

## Deploy

- **API:** `npx supabase login` once, then `pnpm deploy:api`. It goes live at
  https://hpsiylvlgzngoincqnca.supabase.co/functions/v1/api/v1/health. JWT verification at the gateway is off
  because the function verifies tokens itself, so `openapi.json` and `health` stay public.
- **Web:** Vercel (Hobby, free). Import the GitHub repo; `vercel.json` sets the install/build commands, output
  `apps/web/dist`, the SPA fallback and cache headers. Production env values are in `apps/web/.env.production`.
