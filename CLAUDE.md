# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Placement Tracker" — a personal, single-user kanban/calendar tracker for campus placement events (PPTs, online/offline tests, interview rounds), with 24h-before email reminders. See `README.md` for the full feature/event-model description.

## Commands

Package manager is **bun** (`bun.lock`, `bunfig.toml` present — do not add `package-lock.json`/`yarn.lock`).

```sh
bun install
bun run dev          # vite dev — starts the TanStack Start app
bun run build        # vite build
bun run build:dev    # vite build --mode development
bun run preview      # broken — see note below, use `bun run start` instead
bun run start        # node .output/server/index.mjs — runs an actual production build
bun run lint         # eslint .
bun run format       # prettier --write .
bun run test         # vitest run
bun run test:watch   # vitest (watch mode)
bun run test:coverage  # vitest run --coverage
bun run test:e2e     # playwright test (starts its own dev server on :8080)
```

Run a single Vitest file/test: `bunx vitest run src/lib/domain.test.ts -t "returns the label"`. Run a single Playwright spec: `bunx playwright test e2e/board.spec.ts`.

`bun run preview` (plain `vite preview`) always 500s with `ERR_MODULE_NOT_FOUND` looking for `dist/server/server.js` — its preview plugin expects TanStack Start's own default (non-nitro) output layout, but this project always builds through `nitro/vite` (output goes to `.output/server/index.mjs` instead), regardless of preset. This isn't fixable by changing presets — it's a mismatch between "using nitro at all" and what `vite preview` expects. To actually run a production build locally, use `bun run start` instead (or just trust `bun run build` passing).

### Testing setup
- `vitest.config.ts` is standalone (not merged into `vite.config.ts`). Coverage is scoped to `src/lib/domain.ts`, `src/lib/reminders.ts`, `src/lib/events-api.ts` with an 80% threshold on all four metrics — this is a deliberate narrow scope, not the whole `src/` tree; extend `coverage.include` deliberately if adding more testable pure logic to `src/lib`.
- Test files are colocated (`*.test.ts` next to source), not in a `__tests__` directory.
- `src/lib/events-api.test.ts` mocks `@/integrations/supabase/client` with a hand-rolled chainable/thenable query-builder mock (`makeBuilder`/`queueFromResults`) — extend that pattern rather than reaching for a Supabase test-double library.
- **E2E tests run against the real single-user Supabase project** — there is no separate test database. `e2e/board.spec.ts` tags any data it creates with `company: "__e2e_test__"` and deletes it in `afterEach` (which also runs cleanup if the test itself failed partway). Follow the same tag-and-clean pattern for any new E2E test that writes data.
- Playwright's `webServer` in `playwright.config.ts` runs `bun run dev` itself and expects port `8080` (Vite's default here) — don't hardcode a different port without checking `bun run dev`'s actual output first.

## Architecture

### Stack
TanStack Start (file-based router + SSR) + React 19 + Tailwind v4 + shadcn/ui (Radix) + TanStack Query + Supabase (Postgres) + Resend (email) + dnd-kit (kanban) + Recharts (dashboard).

### `src/routeTree.gen.ts` — do not hand-edit
Regenerated automatically by the TanStack router plugin from `src/routes/**` whenever `vite dev`/`vite build` runs. Declaration order in this file can shuffle between regenerations — that's harmless.

### `vite.config.ts`
A plain `defineConfig` composing `@tailwindcss/vite`, `vite-tsconfig-paths`, the TanStack Start plugin (`@tanstack/react-start/plugin/vite`, with `server: { entry: "server" }` redirecting the server entry to `src/server.ts`), `nitro/vite`'s `nitro()` plugin on build only (targeting the `node-server` preset — a plain long-running Node HTTP server, deployable to any VPS/PaaS; run it via `bun run start`), and `@vitejs/plugin-react`. Also sets up `resolve.dedupe`/`optimizeDeps` for React and TanStack Query, an explicit `VITE_`-prefixed env `define` pass (belt-and-suspenders alongside Vite's normal `import.meta.env` handling, useful under SSR/nitro bundling), and a dev-server watch debounce. No wrapper package — every plugin here is a direct dependency in `package.json`, so add/adjust plugins directly in this file rather than looking for hidden composed config elsewhere.

### Supabase client split (important — this is a common source of bugs)
- `src/integrations/supabase/client.ts` — browser/SSR client, anon/publishable key, RLS-enforced. Default for all UI data access (`src/lib/events-api.ts`).
- `src/integrations/supabase/client.server.ts` — service-role client, **bypasses RLS**. Only import inside other `*.server.ts` modules or dynamically inside server route handlers (see the comment in that file); a top-level import from a route file or `*.functions.ts` ships it into the client bundle.
- `src/integrations/supabase/auth-middleware.ts` (`requireSupabaseAuth`) — server-side function middleware that validates a Bearer JWT and injects `{ supabase, userId, claims }` into context. `src/start.ts` registers `attachSupabaseAuth` (client-side) globally so browser serverFn calls carry the session token automatically.
- Since this app has no login screen (single-user, open RLS policies — see the migration in `supabase/migrations/`), `requireSupabaseAuth` is currently unused by app routes; it exists as scaffolding for if/when auth gets added.

### Routing (`src/routes/`)
File-based routing per `src/routes/README.md` — do not create `src/pages/` or Next/Remix-style directories. `__root.tsx` is the only layout shell (renders `<Outlet />`, wraps the app in `QueryClientProvider`, defines the root error/not-found components). Route files under `api/` (e.g. `src/routes/api/public/run-reminders.ts`) define server-only HTTP handlers via `server.handlers`.

Pages: `/` (dashboard/stats), `/board` (kanban), `/calendar` (month view), `/list` (table), `/settings` (reminder config). All four data views share one query key (`["events"]`, from `listEvents()`) and open the same `EventDrawer` for create/edit — there is no `/event/$id` route; editing happens in-place via drawer state (`editing`/`open` local state per page).

### Domain layer
`src/lib/domain.ts` is the single source of truth for enum values/labels/colors (`EventType`, `EventMode`, `EventStatus`, `EventPriority`), all derived from the generated `Database` type. `src/lib/events-api.ts` is the only data-access layer (`listEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`, `setStatus`, `getSettings`, `updateSettings`) — routes/components call these, never `supabase.from(...)` directly.

Kanban statuses are a fixed pipeline (`UPCOMING → PPT_DONE → OT_SCHEDULED → OT_CLEARED → INTERVIEW_R1 → INTERVIEW_R2 → HR → OFFER / REJECTED / GHOSTED`), defined in both the Postgres enum (`supabase/migrations/`) and `EVENT_STATUSES` in `domain.ts` — changing one requires a matching migration + `domain.ts` update + regenerating `types.ts`.

### Reminder pipeline
`src/routes/api/public/run-reminders.ts` is a POST/GET server route (uses `supabaseAdmin` from `client.server.ts`) that: reads the single-row `settings` table, finds events with `reminder_sent = false` starting 23–25h out (via `reminderWindow()` in `src/lib/reminders.ts`), emails each via the Resend HTTP API (`renderReminderEmail()`), then flips `reminder_sent`. The route is guarded by a `REMINDER_CRON_SECRET` shared-secret header check (`x-reminder-cron-secret`, timing-safe compare, fails closed if the env var isn't set) — it is **not** a truly public endpoint despite the `api/public/` path. It's invoked every 15 minutes by a `pg_cron` job (`supabase/migrations/20260722201059_schedule_reminder_cron.sql`) calling `net.http_post` with that header; the secret itself is never committed — the migration reads it via Postgres `current_setting('app.reminder_cron_secret')`, which must be set once by hand (`ALTER DATABASE ... SET app.reminder_cron_secret = '...'`) in the Supabase SQL editor. **The migration ships with a `<PROD_APP_URL>` placeholder** for the `net.http_post` target — cron won't actually fire correctly until that's replaced with the real deployed app URL and the `cron.schedule` block is re-run.

### SSR error handling (non-obvious, don't "simplify" without reading both files)
Two layers guard against unhandled SSR crashes reaching users as a raw stack trace or blank page — these are app-level workarounds for a real h3/Nitro quirk, not incidental complexity:
- `src/start.ts` wraps all server functions (`errorMiddleware`) to catch thrown non-HTTP errors and return a rendered error page instead.
- `src/server.ts` wraps the whole Nitro/h3 fetch handler; it additionally detects the case where **h3 itself** swallows an in-handler throw into a generic `{"unhandled":true,"message":"HTTPError"}` JSON 500 (a try/catch around the handler call doesn't see these), and substitutes the real captured error via `src/lib/error-capture.ts`'s out-of-band `window.onerror`/`unhandledrejection` capture.

## Conventions
- Path alias `@/*` → `src/*`.
- Prettier: 100 print width, double-space-free (`singleQuote: false`), trailing commas everywhere, semicolons on. ESLint delegates formatting to `eslint-plugin-prettier`; `@typescript-eslint/no-unused-vars` is off.
- `bunfig.toml` enforces a 24h supply-chain delay on new package versions (`minimumReleaseAge`) with no exceptions currently configured.
