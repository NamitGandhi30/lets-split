# Let's Split: build brief

Read this first. It records the final decisions from the design phase. Where the original plan disagrees, this brief wins. The original plan is at `C:\Users\namit\.claude\plans\i-am-going-on-sprightly-liskov.md`.

## What it is
A free, personal Splitwise replacement for trips with friends and cousins.
- **Platform:** installable PWA; most users are on iPhone.
- **Region:** India, so INR and UPI.
- **Cost:** $0 to run.
- **Future:** might be published later.

## Architecture (fixed)
- **Frontend:** Vite + React 19 + TypeScript + Tailwind v4 + React Router + TanStack Query. A **static SPA only**: no SSR and no Next.js, so Capacitor can wrap it later.
- **Backend:** a versioned REST API (`/v1`) on a **Supabase Edge Function** using Hono + zod-openapi, publishing an OpenAPI spec. The client never queries tables directly.
- **Shared logic:** `packages/core`, pure TypeScript with no dependencies.
  - Contents: money in integer paise, split types, largest-remainder rounding, balances, greedy min-cash-flow debt simplification, UPI link builder, WhatsApp summary.
  - The API is the source of truth; the web app uses core only for offline previews.
- **Data:** Supabase Postgres with RLS via `is_group_member()`.
  - Placeholder members: `group_members.user_id` can be null.
  - Client-generated UUIDs double as idempotency keys.
  - Realtime is used only as a "changed" ping; the client then refetches through REST.
- **Auth:** email 6-digit OTP, sent through Brevo SMTP (free).
- **Receipt AI:** Gemini Flash (Google AI Studio free tier), falling back to an OpenRouter `:free` vision model. The provider adapter and model names live in env vars.
- **Weather chip:** only a "Place · temp · condition" chip in the Home header.
  - Data: device location, asked once and optional, plus Open-Meteo current weather (free, no key).
  - **No themed backgrounds and no location-based customization.** The user rejected both.
- **Hosting:** Vercel or Cloudflare Pages, as a static site.

## Design (approved)
- **Visual source of truth:** the Figma file "Let's Split", https://www.figma.com/design/PK6E3bbBMBUul9xIisndHQ
  - Screens 01–20, Wrapped slides 1–5 at y=2000, and the design system board at y=3000.
- **Motion and interaction source of truth:** the prototype, which shows the exact layouts and spring physics.
  - Local file: `design/prototype.template.html`, built with `node design/build-proto.mjs` into `design/prototype.html`.
  - Live: https://claude.ai/artifact/TzuyBBeDcn5qaDT1X7oLtQ
- **Font:** **Outfit** everywhere; Geist Mono only for receipt lines. Amounts always show smaller, lighter decimals, e.g. ₹**4,280**.50.
- **Colors:**
  - Dark chrome: #0E0F12, surface #1C1E23.
  - Light sheet: #F6F6F7, card #FFF.
  - Ink: #121316.
  - Trip accents: Goa #F4D23C, Manali #3FD0B6, Jaipur #5C8DFF.
  - Positive: #2FA372. Negative: #E6613D.
  - The full token list is on the design system board.
- **Avatars:** doodle line-art style. Generator: `design/assets/make-doodles.mjs`, which exports `doodles`. Users can pick an avatar or upload a photo; no letter initials anywhere.
- **Navigation:**
  - **3 tabs:** Home · ＋ (Add expense) · Stats.
  - **Alerts:** the bell at Home's top right, with a red dot.
  - **Trip page:** opened from "See all ›"; has Expenses and Balances tabs and opens Transaction detail.
- **Add expense:**
  - Amount and meta chips.
  - A ticket card with an **Equal | Uneven** switch:
    - **Equal:** a split ring with avatar pins, presets, and person rows with checks.
    - **Uneven:** vertical pill sliders; dragging one rebalances the others to the exact total.
  - Save stamps "REQUESTED" with confetti.
- **Stats tab:** the Wrapped entry, day-pill daily spend, category bars, and who paid most.
  - **Trip Wrapped:** 5 Spotify-2024-style slides. The animated gradient-shard background drifts behind white type, with dark glass cards and quirky quotes. The "still owes" slide was removed.
- **Settle up:** a UPI sheet with a dynamic QR, copy UPI ID, copy amount, GPay / PhonePe / Paytm deep links, Save QR to Photos, and "Did it go through?". Profile has an **"I don't have a UPI ID"** option.
- **Receipt scan:** AI-parsed items, GST and service charge, a check that the total matches, and **live dish claiming** in realtime.
- **Motion:**
  - Two springs: snappy (stiffness 320 / damping 30) and bouncy (170 / 13).
  - A draggable sheet with velocity, count-ups, card-stack flick, and staggered lists.
  - Respects Reduce Motion.

## Build order
1. **Foundation:**
   - pnpm workspace (`apps/web`, `packages/core`, `supabase/functions/api`).
   - `packages/core` with Vitest tests for money math.
   - Supabase project, migrations and RLS.
   - API skeleton with OpenAPI.
   - Email OTP login.
   - Installable PWA shell deployed.
2. **Core:**
   - Trips/groups, invites (link and QR), placeholder members and claiming.
   - Expenses with every split type and multiple payers.
   - Balances and simplification, settle (UPI sheet), activity and alerts.
   - Offline queue.
3. **Then:** receipt scanner with live claiming, presets, Stats + Wrapped, WhatsApp summary, push nudges.

## Notes
- **Figma access:** through the local Talk-to-Figma bridge, not the official Figma MCP, which is rate-limited on the Starter plan.
  - Repo: `D:\Dev\tools\cursor-talk-to-figma-mcp`, with a local plugin "Lets Split Figma Bridge" on channel `letssplit`.
  - The relay must be running: `bun run src/socket.ts` in that repo.
- **The user's preferences:**
  - Polished, show-off motion.
  - Nothing childish.
  - Design approved before code.
  - Static frontend + REST backend, for portability.
