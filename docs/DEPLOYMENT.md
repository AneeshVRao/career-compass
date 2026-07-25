# Deployment

## Current status

**Fully live, reminders included.** The app is on Render at `https://career-compass-nowy.onrender.com` (Blueprint ID `exs-d9h1f1brjlhs73dcb7ag`), built via the `render.yaml` Blueprint. `/`, `/board`, and `/calendar` return 200. The reminder cron is scheduled and verified end-to-end — see the runbook below.

The Supabase project also changed mid-project: the original project (`irzxntglqqwyrvmkxkpy`, provisioned through Lovable Cloud) was replaced with a fresh, self-created project (`iqqkvnjwrgyiigafxsqp`) with no Lovable history at all. The fresh project starts with **no schema** — both migrations in `supabase/migrations/` need to be applied to it before the app will work against it at all (see "Database setup" below). `docs/DATABASE.md` and `docs/DECISIONS.md`'s historical entries still reference the old project ID where they're describing something that happened on it; that's intentional, not a stale reference.

## Database setup (new project — do this first)

The current Supabase project (`iqqkvnjwrgyiigafxsqp`) is empty. Before anything else works, paste both migration files into its SQL editor, in order:

1. `supabase/migrations/20260722131142_8274acba-a280-46aa-83b5-f2549fdcb9b8.sql` — creates the enums, `events`/`settings` tables, RLS policies, indexes, and enables `pg_cron`/`pg_net`.
2. `supabase/migrations/20260722201059_schedule_reminder_cron.sql` — the `<PROD_APP_URL>` placeholder is now filled in with the real Render URL. Still needs the `reminder_cron_secret` row inserted into `private.app_secrets` and the full migration run by hand in the SQL editor — see the runbook below.
3. `supabase/migrations/20260725120000_multi_user_auth.sql` — per-user ownership, user-scoped RLS, signup trigger. Safe to run immediately.
4. `supabase/migrations/20260725120100_lockdown_user_id_not_null.sql` — **do not run yet.** Only after the manual backfill; see "Multi-user data backfill runbook" below.

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
| `SUPABASE_URL` | `client.ts`, `client.server.ts`, `client.request.server.ts` | App throws on startup — every Supabase client construction checks for this and errors loudly rather than silently failing |
| `SUPABASE_PUBLISHABLE_KEY` | `client.ts`, `client.request.server.ts` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts` (`supabaseAdmin`) | The reminder route can't read/write with elevated privileges — it needs this specifically because the reminder job runs with no user session to attach an RLS-scoped token to |
| `RESEND_API_KEY` | `run-reminders.ts` | Reminder route returns a 500 (`"Missing RESEND_API_KEY"`) before attempting to send anything |
| `REMINDER_CRON_SECRET` | `run-reminders.ts` | Route fails closed with a 500 (`"REMINDER_CRON_SECRET not configured"`) rather than silently allowing unauthenticated requests through |

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the `import.meta.env`-prefixed twins used client-side) also need to be present at *build* time, not just runtime — Vite bakes `VITE_`-prefixed vars into the client bundle at build time, so setting them only in the running server's environment after the fact won't reach the browser.

**Multi-user auth added no new environment variables.** This was verified deliberately, since it's the kind of thing that silently breaks a deploy:

- Cookie-based sessions reuse the existing `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `VITE_*` pair. The new cookie-aware server client (`client.request.server.ts`) reads the same vars, falling back to the `VITE_`-prefixed ones if the unprefixed pair isn't set.
- The **Google OAuth client ID and secret live in the Supabase dashboard**, not in app env — the app never sees them. It only calls `supabase.auth.signInWithOAuth({ provider: "google" })`; Supabase owns the credential exchange.
- Cookie signing/encryption needs no secret of its own: Supabase's session cookie carries the already-signed JWTs issued by Supabase Auth.

So `render.yaml`'s existing 7 `sync: false` vars remain correct and complete. The only production configuration this feature needs is dashboard-side, in the two runbooks below.

## Google OAuth setup runbook

Dashboard-only; there is no CLI/API path to Supabase in this environment (see the note at the end of this file). Do this **before** expecting the "Sign in with Google" button to work — until it's done, that button returns a provider-not-enabled error while email/password sign-in works fine.

1. **Create the Google OAuth client.** In the [Google Cloud console](https://console.cloud.google.com/) → *APIs & Services* → *Credentials* → **Create credentials** → **OAuth client ID** → application type **Web application**.
   - *Authorised JavaScript origins*: `http://localhost:8080` and `https://career-compass-nowy.onrender.com`.
   - *Authorised redirect URI*: **the Supabase callback, not the app's** — `https://iqqkvnjwrgyiigafxsqp.supabase.co/auth/v1/callback`. This is the single most common thing to get wrong: Google redirects to Supabase, Supabase then redirects to the app's `/auth/callback`.
   - Copy the generated **Client ID** and **Client secret**.
2. **Enable the provider in Supabase.** Dashboard for project `iqqkvnjwrgyiigafxsqp` → *Authentication* → *Providers* → **Google** → toggle on, paste the Client ID and Client secret, save.
3. **Set the URL configuration.** *Authentication* → *URL Configuration*:
   - **Site URL**: `https://career-compass-nowy.onrender.com` (this is where Supabase sends users when a redirect target isn't otherwise specified, and it's what email-confirmation links point at).
   - **Redirect URLs** (allowlist — an unlisted URL is silently refused): add both `http://localhost:8080/auth/callback` and `https://career-compass-nowy.onrender.com/auth/callback`. The app passes `redirectTo: ${window.location.origin}/auth/callback`, so both origins need listing to work in dev *and* prod.
4. **Decide the email-confirmation setting.** *Authentication* → *Providers* → *Email* → "Confirm email". Signup is open (anyone can create an account), so leaving confirmation **on** is the recommended posture — it stops someone enrolling with an address they don't control. The `/login` page handles both settings: with confirmation on, sign-up shows a "check your email" notice and no session is issued until the link is clicked; with it off, sign-up signs the user straight in.
5. **Verify.** Visit `/login` on both localhost and the Render URL, click "Sign in with Google", complete the Google consent screen, and confirm you land on `/` signed in with your email shown in the sidebar. A brand-new Google account should also get a `settings` row automatically (via the `handle_new_user()` trigger) — check `/settings` renders populated rather than erroring.

## Multi-user data backfill runbook

**This must run between the two auth migrations.** Ordering, precisely:

1. Run `supabase/migrations/20260725120000_multi_user_auth.sql` (safe immediately — adds nullable `user_id`, user-scoped RLS, the signup trigger).
2. **Run the backfill below by hand.**
3. Only then run `supabase/migrations/20260725120100_lockdown_user_id_not_null.sql`.

Why the gap: `user_id`'s `auth.uid()` default stamps an owner on *new* inserts, but does nothing for the rows that already existed. Those keep `user_id IS NULL`, and since every RLS policy matches `auth.uid() = user_id`, **they are invisible to every logged-in user until claimed** — including to you. Existing data isn't lost, just unowned. The lockdown migration deliberately fails with a NOT NULL violation if you skip step 2, rather than letting the inconsistency persist.

Steps, in the Supabase SQL editor for project `iqqkvnjwrgyiigafxsqp`:

1. **Create your own account first**, via the app's `/login` page (email/password or Google). The backfill needs a real `auth.users` row to point at. This also fires `handle_new_user()`, which creates a *fresh* settings row for you — which matters in step 4.
2. **Find your user ID**, substituting your address:
   ```sql
   select id, email from auth.users where email = 'aneeshvrao2017@gmail.com';
   ```
3. **Claim the ownerless events.** Only `IS NULL` rows are touched, so this is safe to re-run and can never steal another user's rows:
   ```sql
   update public.events
      set user_id = (select id from auth.users where email = 'aneeshvrao2017@gmail.com')
    where user_id is null;
   ```
4. **Resolve settings.** There are now potentially two rows: the original ownerless one, and the one the signup trigger just made for you. `settings.user_id` is `UNIQUE`, so blindly claiming the old row would violate the constraint. Keep the trigger-created row and discard the legacy one — but carry over the reminder preferences first, which is the only part actually worth preserving:
   ```sql
   -- Copy the legacy preferences onto your real (trigger-created) row.
   update public.settings dst
      set reminder_email    = src.reminder_email,
          reminders_enabled = src.reminders_enabled,
          from_email        = src.from_email
     from (select * from public.settings where user_id is null limit 1) src
    where dst.user_id = (select id from auth.users where email = 'aneeshvrao2017@gmail.com');

   -- Then drop the now-redundant ownerless row(s).
   delete from public.settings where user_id is null;
   ```
   (If no ownerless settings row exists — e.g. a fresh project — both statements are harmless no-ops and you can skip straight to step 5.)
5. **Verify nothing is left unowned.** Both counts must be `0` before proceeding:
   ```sql
   select count(*) as ownerless_events   from public.events   where user_id is null;
   select count(*) as ownerless_settings from public.settings where user_id is null;
   ```
6. **Run the lockdown migration.** Paste `supabase/migrations/20260725120100_lockdown_user_id_not_null.sql` into the SQL editor and run it. It should succeed; if it errors with a NOT NULL violation, step 5 wasn't actually clean.
7. **Confirm in the app.** Sign in and check `/list` shows your historical events again (they were hidden between steps 1 and 3 — that's expected, not data loss).

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
