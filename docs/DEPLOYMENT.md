# Deployment

## Current status

**Deployed and the reminder cron is live — but the data layer is broken.** The app is on Render at `https://career-compass-nowy.onrender.com` (Blueprint ID `exs-d9h1f1brjlhs73dcb7ag`), built via the `render.yaml` Blueprint. All five routes return 200, and the reminder cron is scheduled and verified end-to-end (see the runbook below).

What is _not_ working: as of **2026-07-26** the `anon` role has no table privileges on the live Supabase project, so every client-side read and write fails with `42501 permission denied for table events`. The pages serve; they just can't load or save data. Note the reminder job is unaffected — it runs with the service-role key, which still has full access, so a healthy cron says nothing about whether the app itself can reach the database.

Note what that means for smoke-testing a deploy: **a 200 from a route proves nothing about the database.** These pages SSR fine with a dead data layer. Check an actual REST call instead:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  "$SUPABASE_URL/rest/v1/events?select=id&limit=1" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
```

`200` is healthy. `401` with `42501` is this bug. Full diagnosis and the resolution decision live in `docs/STATUS.md`.

The Supabase project also changed mid-project: the original project (`irzxntglqqwyrvmkxkpy`, provisioned through Lovable Cloud) was replaced with a fresh, self-created project (`iqqkvnjwrgyiigafxsqp`) with no Lovable history at all. The fresh project starts with **no schema** — both migrations in `supabase/migrations/` need to be applied to it before the app will work against it at all (see "Database setup" below). `docs/DATABASE.md` and `docs/DECISIONS.md`'s historical entries still reference the old project ID where they're describing something that happened on it; that's intentional, not a stale reference.

## Database setup (new project — do this first)

The current Supabase project (`iqqkvnjwrgyiigafxsqp`) is empty. Before anything else works, paste both migration files into its SQL editor, in order:

1. `supabase/migrations/20260722131142_8274acba-a280-46aa-83b5-f2549fdcb9b8.sql` — creates the enums, `events`/`settings` tables, RLS policies, indexes, and enables `pg_cron`/`pg_net`.
2. `supabase/migrations/20260722201059_schedule_reminder_cron.sql` — the `<PROD_APP_URL>` placeholder is now filled in with the real Render URL. Still needs the `reminder_cron_secret` row inserted into `private.app_secrets` and the full migration run by hand in the SQL editor — see the runbook below.

## Deploy target

`vite.config.ts` targets nitro's `node-server` preset — a plain, long-running Node HTTP server, produced at `.output/server/index.mjs`. Run it with `bun run start` (which is just `node .output/server/index.mjs`). It honors nitro's default `PORT` env var binding out of the box (verified locally: `PORT=3000 bun run start` serves correctly) — no code changes needed for Render's dynamic port assignment.

This replaced an earlier `cloudflare-module` preset choice. The switch happened because there's no Cloudflare account to deploy to — `node-server` was chosen specifically because it's deployable to _any_ host that can run a long-lived Node process: Railway, Render, Fly.io, a plain VPS, a Docker container, etc. **Render was picked** (account already exists).

## Render setup

`render.yaml` at the repo root is a Blueprint that defines the web service (`runtime: node`, `buildCommand: bun install && bun run build`, `startCommand: bun run start` — Render's `node` runtime bundles Bun natively). The 7 required secrets are listed with `sync: false`, meaning Render will prompt for each value at Blueprint creation rather than trying to pull them from anywhere — **the blueprint file itself never contains secret values**.

To actually stand up the service (this part requires the Render dashboard — no CLI/API key exists in this environment to do it headlessly):

1. Log into the Render dashboard → **New** → **Blueprint** → point it at this GitHub repo (`AneeshVRao/career-compass`) on the `main` branch. Render will detect `render.yaml` automatically.
2. When prompted, paste in the 7 env var values from local `.env` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REMINDER_CRON_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
3. Deploy. Render assigns a `*.onrender.com` URL — that URL is `<PROD_APP_URL>` for the cron migration step below.

Do not use `bun run preview` (plain `vite preview`) to sanity-check a production build — it's fundamentally incompatible with this setup and always 500s with `ERR_MODULE_NOT_FOUND` looking for `dist/server/server.js`. That path is TanStack Start's own default (non-nitro) output location; this project always builds through `nitro/vite` instead, which outputs to `.output/` regardless of which preset is selected. Changing the preset doesn't fix this — it's a mismatch between "using nitro at all" and what `vite preview`'s bundled preview plugin expects. Use `bun run start` instead.

## Required production environment variables

None of these exist anywhere except the local `.env` file right now. Whatever host gets picked needs all of them set as its own environment/secrets:

| Variable                    | Used by                              | What breaks without it                                                                                                                                                        |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | `client.ts`, `client.server.ts`      | App throws on startup — every Supabase client construction checks for this and errors loudly rather than silently failing                                                     |
| `SUPABASE_PUBLISHABLE_KEY`  | `client.ts`                          | Same as above                                                                                                                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts` (`supabaseAdmin`) | The reminder route can't read/write with elevated privileges — it needs this specifically because the reminder job runs with no user session to attach an RLS-scoped token to |
| `RESEND_API_KEY`            | `run-reminders.ts`                   | Reminder route returns a 500 (`"Missing RESEND_API_KEY"`) before attempting to send anything                                                                                  |
| `REMINDER_CRON_SECRET`      | `run-reminders.ts`                   | Route fails closed with an opaque `401 "Unauthorized"` — identical to a wrong secret, so callers can't probe config state. The real reason is logged server-side              |

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the `import.meta.env`-prefixed twins used client-side) also need to be present at _build_ time, not just runtime — Vite bakes `VITE_`-prefixed vars into the client bundle at build time, so setting them only in the running server's environment after the fact won't reach the browser.

## Reminder cron setup runbook

**Done.** `private.app_secrets` is created and seeded, and `placement-tracker-reminders` is scheduled (job id 1, every 15 min) against the live Render URL. Verified with `curl -X POST https://career-compass-nowy.onrender.com/api/public/run-reminders -H "x-reminder-cron-secret: <the-secret>"` → `{"ok":true,"checked":0,"results":[]}`. Steps taken, for reference / re-running after a secret rotation:

1. In the Supabase SQL editor for project `iqqkvnjwrgyiigafxsqp`, run **by hand** (never commit this exact statement with a real value in it) — use the same value set as `REMINDER_CRON_SECRET` on Render so the two sides match:
   ```sql
   INSERT INTO private.app_secrets (key, value) VALUES ('reminder_cron_secret', '<the-REMINDER_CRON_SECRET-value>')
     ON CONFLICT (key) DO UPDATE SET value = excluded.value;
   ```
   (The `private.app_secrets` table itself is created by `supabase/migrations/20260722201059_schedule_reminder_cron.sql` — run that migration's `CREATE SCHEMA`/`CREATE TABLE` portion first if the table doesn't exist yet.)
2. Paste the full contents of `supabase/migrations/20260722201059_schedule_reminder_cron.sql` (URL placeholder already filled in) into the Supabase SQL editor and run it. It's written to be safely re-runnable (`cron.unschedule(...) where exists (...)` before the `cron.schedule(...)` call, `CREATE SCHEMA/TABLE IF NOT EXISTS`), so re-running it later is fine.
3. Verify: the curl above should return `{"ok":true,...}` rather than a 401 or 500.

There is currently no way to apply Supabase migrations from the CLI in this environment — `supabase login` was never run, so `supabase db push` fails with an auth error. The SQL-editor-paste workflow above is the only currently-working path; if CLI access gets set up later, `supabase link --project-ref iqqkvnjwrgyiigafxsqp && supabase db push` would be the alternative.

### Gotcha: Render's env var field can silently corrupt long values

Pasting the `SUPABASE_SERVICE_ROLE_KEY` JWT into Render's dashboard once produced a value with a stray space injected mid-string (visible only by re-reading the value back), which broke Supabase auth for every request `supabaseAdmin` made. It didn't surface as an auth error, though — `run-reminders.ts`'s settings query doesn't check the Supabase client's `error` field, only whether `data` came back, so a corrupted key manifested as a misleading `"No settings row"` 500 instead of a 401. If any Supabase-auth-dependent route starts failing after an env var edit on Render, re-paste the value as one continuous string (select-all-delete the field first, don't edit in place) before assuming the underlying data is missing.

## Supabase project ownership

**Resolved.** The original project (`irzxntglqqwyrvmkxkpy`) was provisioned through Lovable Cloud, which raised a genuine question about who still had platform-level dashboard access after the codebase was de-Lovable'd (see `docs/DECISIONS.md`). That's moot now — the app runs against a fresh project (`iqqkvnjwrgyiigafxsqp`) created directly, with no Lovable involvement at any point. The old project is no longer referenced anywhere in the running app; it can be left alone or deleted at your discretion.
