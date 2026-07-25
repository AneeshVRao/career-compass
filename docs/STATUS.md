# Status / next steps

Living punch list — update this as items get done rather than treating it as a one-time snapshot.

1. **Apply the multi-user auth migration, then backfill, then lock down.** Three ordered steps, all needing the Supabase SQL editor (no CLI path in this environment):
   1. Run `supabase/migrations/20260725120000_multi_user_auth.sql`.
   2. Create your account at `/login`, then run the backfill SQL to claim the existing ownerless `events`/`settings` rows. **Between these steps your existing events will appear to have vanished from the app** — that's RLS working as intended on unowned rows, not data loss.
   3. Only then run `supabase/migrations/20260725120100_lockdown_user_id_not_null.sql`.
   Full runbook: `docs/DEPLOYMENT.md` → "Multi-user data backfill runbook".
2. **Enable Google OAuth in the Supabase dashboard.** The "Sign in with Google" button on `/login` returns a provider-not-enabled error until this is done (email/password works regardless). Needs a Google Cloud OAuth client, the provider toggled on in Supabase, and both localhost + Render `/auth/callback` URLs allowlisted. Runbook: `docs/DEPLOYMENT.md` → "Google OAuth setup runbook". Decide the "Confirm email" setting at the same time — recommended **on**, since signup is open.
3. **Visually verify the redesign, now including `/login`.** Nothing about the `docs/DESIGN.md` "dossier" redesign has actually been looked at in a rendered browser — the Playwright automation tool disconnected mid-session before a screenshot could happen. Everything was confirmed structurally (build passes, the right CSS/copy is served) but not eyeballed. Run `bun run dev` (or visit the live Render URL) and look at all five pages plus the new sign-in page before trusting it's actually good.
4. **Run the new E2E auth specs against a real project.** `e2e/auth.spec.ts` was written but not executed here (it needs the migration applied first, since every assertion depends on the redirect-to-`/login` behaviour). Run `bunx playwright test e2e/auth.spec.ts` after step 1. Note it creates a disposable `__e2e_test__+<ts>@example.com` account and deletes it via the admin API in `afterEach`.
5. **Turn on GitHub branch protection for `main`.** The repo now has real history (bootstrapped with one direct push, see `docs/DECISIONS.md`) — enabling branch protection turns "every change gets a PR" from a convention into something GitHub actually enforces.

~~Multi-user auth implementation~~ — done in code on `feat/multi-user-auth`: cookie-based Supabase sessions, `/login` (email/password + Google), one server-side route guard, per-user RLS migrations, per-user reminder fan-out, sign-out in `AppShell`. Build, unit tests, and lint verified. The remaining work is all dashboard/SQL-editor configuration — items 1, 2 and 4 above.

~~Apply the initial schema migration~~ — done. The new Supabase project (`iqqkvnjwrgyiigafxsqp`) has its `events`/`settings` tables, enums, RLS, and extensions in place.

~~Supabase access review~~ — resolved by switching to a fresh, self-created Supabase project with no Lovable Cloud history. See `docs/DEPLOYMENT.md`.

~~Deploy to Render~~ — done. Live at `https://career-compass-nowy.onrender.com` (Blueprint ID `exs-d9h1f1brjlhs73dcb7ag`). `/`, `/board`, `/calendar` verified with 200s.

~~Set production env vars on Render~~ — done as part of the Blueprint deploy above.

~~Run the reminder cron migration~~ — done. `private.app_secrets` created and seeded, cron job `placement-tracker-reminders` scheduled (job id 1, every 15 min) against the real Render URL. Verified end-to-end with a manual `curl` to `/api/public/run-reminders`: `{"ok":true,"checked":0,"results":[]}` — auth, settings lookup, and the event-window query all work. (`checked: 0` is correct — nothing is currently inside the 23–25h reminder window.) Hit one bug along the way: Render's env var text field silently inserted a space in the middle of the pasted `SUPABASE_SERVICE_ROLE_KEY` JWT, which broke Supabase auth and surfaced as a misleading `"No settings row"` error rather than an auth failure — see the gotcha note in `docs/DEPLOYMENT.md`.
