# Status / next steps

Living punch list — update this as items get done rather than treating it as a one-time snapshot.

1. **Visually verify the redesign.** Nothing about the `docs/DESIGN.md` "dossier" redesign has actually been looked at in a rendered browser — the Playwright automation tool disconnected mid-session before a screenshot could happen. Everything was confirmed structurally (build passes, the right CSS/copy is served) but not eyeballed. Run `bun run dev` (or visit the live Render URL) and look at all five pages before trusting it's actually good.
2. **Run the reminder cron migration in the Supabase SQL editor.** `supabase/migrations/20260722201059_schedule_reminder_cron.sql` now has the real `<PROD_APP_URL>` filled in (`https://career-compass-nowy.onrender.com`), but it still needs to be pasted into the SQL editor and run by hand — no CLI/API path to Supabase exists in this environment. This also covers inserting the `reminder_cron_secret` row into `private.app_secrets` (same value as Render's `REMINDER_CRON_SECRET`). Runbook in `docs/DEPLOYMENT.md`.
3. **Turn on GitHub branch protection for `main`.** The repo now has real history (bootstrapped with one direct push, see `docs/DECISIONS.md`) — enabling branch protection turns "every change gets a PR" from a convention into something GitHub actually enforces.

~~Apply the initial schema migration~~ — done. The new Supabase project (`iqqkvnjwrgyiigafxsqp`) has its `events`/`settings` tables, enums, RLS, and extensions in place.

~~Supabase access review~~ — resolved by switching to a fresh, self-created Supabase project with no Lovable Cloud history. See `docs/DEPLOYMENT.md`.

~~Deploy to Render~~ — done. Live at `https://career-compass-nowy.onrender.com` (Blueprint ID `exs-d9h1f1brjlhs73dcb7ag`). `/`, `/board`, `/calendar` verified with 200s.

~~Set production env vars on Render~~ — done as part of the Blueprint deploy above.
