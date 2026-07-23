# Deployment

## Current status

**Not deployed anywhere yet** — the plan is to finish local verification first, then deploy to Render (an account already exists). Local `.env` now has real values for every secret except the deployed app doesn't exist yet, so `<PROD_APP_URL>` in the cron migration is still a placeholder. The only thing verified so far is a local production build (`bun run build` → `bun run start`, serving on `http://localhost:3000`).

The Supabase project also changed mid-project: the original project (`irzxntglqqwyrvmkxkpy`, provisioned through Lovable Cloud) was replaced with a fresh, self-created project (`iqqkvnjwrgyiigafxsqp`) with no Lovable history at all. The fresh project starts with **no schema** — both migrations in `supabase/migrations/` need to be applied to it before the app will work against it at all (see "Database setup" below). `docs/DATABASE.md` and `docs/DECISIONS.md`'s historical entries still reference the old project ID where they're describing something that happened on it; that's intentional, not a stale reference.

## Database setup (new project — do this first)

The current Supabase project (`iqqkvnjwrgyiigafxsqp`) is empty. Before anything else works, paste both migration files into its SQL editor, in order:

1. `supabase/migrations/20260722131142_8274acba-a280-46aa-83b5-f2549fdcb9b8.sql` — creates the enums, `events`/`settings` tables, RLS policies, indexes, and enables `pg_cron`/`pg_net`.
2. `supabase/migrations/20260722201059_schedule_reminder_cron.sql` — **not yet ready to run** — still has the `<PROD_APP_URL>` placeholder. It's safe (and useful) to run just the `CREATE SCHEMA private` / `CREATE TABLE private.app_secrets` portion early if you want the table to exist ahead of time, but the `cron.schedule(...)` call at the bottom needs the real URL filled in first. See the runbook below.

## Deploy target

`vite.config.ts` targets nitro's `node-server` preset — a plain, long-running Node HTTP server, produced at `.output/server/index.mjs`. Run it with `bun run start` (which is just `node .output/server/index.mjs`). It honors nitro's default `PORT` env var binding out of the box (verified locally: `PORT=3000 bun run start` serves correctly) — no code changes needed for Render's dynamic port assignment.

This replaced an earlier `cloudflare-module` preset choice. The switch happened because there's no Cloudflare account to deploy to — `node-server` was chosen specifically because it's deployable to *any* host that can run a long-lived Node process: Railway, Render, Fly.io, a plain VPS, a Docker container, etc. **Render was picked** (account already exists).

## Render setup

`render.yaml` at the repo root is a Blueprint that defines the web service (`runtime: node`, `buildCommand: bun install && bun run build`, `startCommand: bun run start` — Render's `node` runtime bundles Bun natively). The 7 required secrets are listed with `sync: false`, meaning Render will prompt for each value at Blueprint creation rather than trying to pull them from anywhere — **the blueprint file itself never contains secret values**.

To actually stand up the service (this part requires the Render dashboard — no CLI/API key exists in this environment to do it headlessly):

1. Log into the Render dashboard → **New** → **Blueprint** → point it at this GitHub repo (`AneeshVRao/career-compass`) on the `main` branch. Render will detect `render.yaml` automatically.
2. When prompted, paste in the 7 env var values from local `.env` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REMINDER_CRON_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
3. Deploy. Render assigns a `*.onrender.com` URL — that URL is `<PROD_APP_URL>` for the cron migration step below.

Do not use `bun run preview` (plain `vite preview`) to sanity-check a production build — it's fundamentally incompatible with this setup and always 500s with `ERR_MODULE_NOT_FOUND` looking for `dist/server/server.js`. That path is TanStack Start's own default (non-nitro) output location; this project always builds through `nitro/vite` instead, which outputs to `.output/` regardless of which preset is selected. Changing the preset doesn't fix this — it's a mismatch between "using nitro at all" and what `vite preview`'s bundled preview plugin expects. Use `bun run start` instead.

## Required production environment variables

None of these exist anywhere except the local `.env` file right now. Whatever host gets picked needs all of them set as its own environment/secrets:

| Variable | Used by | What breaks without it |
|---|---|---|
| `SUPABASE_URL` | `client.ts`, `client.server.ts`, `auth-middleware.ts` | App throws on startup — every Supabase client construction checks for this and errors loudly rather than silently failing |
| `SUPABASE_PUBLISHABLE_KEY` | `client.ts`, `auth-middleware.ts` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts` (`supabaseAdmin`) | The reminder route can't read/write with elevated privileges — it needs this specifically because the reminder job runs with no user session to attach an RLS-scoped token to |
| `RESEND_API_KEY` | `run-reminders.ts` | Reminder route returns a 500 (`"Missing RESEND_API_KEY"`) before attempting to send anything |
| `REMINDER_CRON_SECRET` | `run-reminders.ts` | Route fails closed with a 500 (`"REMINDER_CRON_SECRET not configured"`) rather than silently allowing unauthenticated requests through |

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the `import.meta.env`-prefixed twins used client-side) also need to be present at *build* time, not just runtime — Vite bakes `VITE_`-prefixed vars into the client bundle at build time, so setting them only in the running server's environment after the fact won't reach the browser.

## Reminder cron setup runbook

The migration exists but has never been applied anywhere. Note: the secret is stored in a **private Postgres table**, not a custom GUC variable — Supabase's hosted Postgres rejects `ALTER DATABASE ... SET` for custom parameters with `permission denied to set parameter` even from the SQL editor (it requires true superuser, which the platform doesn't grant). See `docs/DECISIONS.md` for the full story. Steps, in order:

1. Generate a secret: `openssl rand -hex 32`. (Already done for local dev — see `REMINDER_CRON_SECRET` in `.env`.)
2. In the Supabase SQL editor for project `iqqkvnjwrgyiigafxsqp`, run **by hand** (never commit this exact statement with a real value in it):
   ```sql
   INSERT INTO private.app_secrets (key, value) VALUES ('reminder_cron_secret', '<paste-the-generated-secret>')
     ON CONFLICT (key) DO UPDATE SET value = excluded.value;
   ```
   (The `private.app_secrets` table itself is created by `supabase/migrations/20260722201059_schedule_reminder_cron.sql` — run that migration's `CREATE SCHEMA`/`CREATE TABLE` portion first if the table doesn't exist yet.)
3. Set the same secret value as `REMINDER_CRON_SECRET` in whatever hosts the deployed app (see the env var table above).
4. Open `supabase/migrations/20260722201059_schedule_reminder_cron.sql` and replace the `<PROD_APP_URL>` placeholder with the actual deployed app URL.
5. Paste the (now-completed) migration SQL into the Supabase SQL editor and run it. It's written to be safely re-runnable (`cron.unschedule(...) where exists (...)` before the `cron.schedule(...)` call, `CREATE SCHEMA/TABLE IF NOT EXISTS`), so re-running it after fixing the URL is fine.
6. Verify: `curl -X POST https://<your-app>/api/public/run-reminders -H "x-reminder-cron-secret: <the-secret>"` should return `{"ok":true,...}` rather than a 401.

There is currently no way to apply Supabase migrations from the CLI in this environment — `supabase login` was never run, so `supabase db push` fails with an auth error. The SQL-editor-paste workflow above is the only currently-working path; if CLI access gets set up later, `supabase link --project-ref iqqkvnjwrgyiigafxsqp && supabase db push` would be the alternative.

## Supabase project ownership

**Resolved.** The original project (`irzxntglqqwyrvmkxkpy`) was provisioned through Lovable Cloud, which raised a genuine question about who still had platform-level dashboard access after the codebase was de-Lovable'd (see `docs/DECISIONS.md`). That's moot now — the app runs against a fresh project (`iqqkvnjwrgyiigafxsqp`) created directly, with no Lovable involvement at any point. The old project is no longer referenced anywhere in the running app; it can be left alone or deleted at your discretion.
