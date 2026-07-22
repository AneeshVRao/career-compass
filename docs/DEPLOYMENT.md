# Deployment

## Current status

**Not deployed anywhere yet.** Everything that follows is a plan for when that changes, not a description of a running system. The only thing that's actually been verified is a local production build (`bun run build` → `bun run start`, serving on `http://localhost:3000`).

## Deploy target

`vite.config.ts` targets nitro's `node-server` preset — a plain, long-running Node HTTP server, produced at `.output/server/index.mjs`. Run it with `bun run start` (which is just `node .output/server/index.mjs`).

This replaced an earlier `cloudflare-module` preset choice. The switch happened because there's no Cloudflare account to deploy to — `node-server` was chosen specifically because it's deployable to *any* host that can run a long-lived Node process: Railway, Render, Fly.io, a plain VPS, a Docker container, etc. No specific host has been picked yet (see `docs/STATUS.md`).

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

The migration exists but has never been applied anywhere. Steps, in order:

1. Generate a secret: `openssl rand -hex 32`.
2. In the Supabase SQL editor for project `irzxntglqqwyrvmkxkpy`, run **by hand** (never commit this exact statement with a real value in it):
   ```sql
   ALTER DATABASE postgres SET app.reminder_cron_secret = '<paste-the-generated-secret>';
   ```
3. Set the same secret value as `REMINDER_CRON_SECRET` in whatever hosts the deployed app (see the env var table above).
4. Open `supabase/migrations/20260722201059_schedule_reminder_cron.sql` and replace the `<PROD_APP_URL>` placeholder with the actual deployed app URL.
5. Paste the (now-completed) migration SQL into the Supabase SQL editor and run it. It's written to be safely re-runnable (`cron.unschedule(...) where exists (...)` before the `cron.schedule(...)` call), so re-running it after fixing the URL is fine.
6. Verify: `curl -X POST https://<your-app>/api/public/run-reminders -H "x-reminder-cron-secret: <the-secret>"` should return `{"ok":true,...}` rather than a 401.

There is currently no way to apply Supabase migrations from the CLI in this environment — `supabase login` was never run, so `supabase db push` fails with an auth error. The SQL-editor-paste workflow above is the only currently-working path; if CLI access gets set up later, `supabase link --project-ref irzxntglqqwyrvmkxkpy && supabase db push` would be the alternative.

## Supabase project ownership

Project `irzxntglqqwyrvmkxkpy` was originally provisioned through Lovable Cloud, before the codebase was de-Lovable'd (see `docs/DECISIONS.md`). Removing Lovable's code references doesn't revoke whatever platform-level dashboard access Lovable Cloud's original provisioning may have granted. Worth a one-time check of Project Settings → team/access in the Supabase dashboard, and worth considering rotating the service-role and anon keys if a hard ownership cutover matters.
