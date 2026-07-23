# Status / next steps

Living punch list — update this as items get done rather than treating it as a one-time snapshot.

1. **Visually verify the redesign.** Nothing about the `docs/DESIGN.md` "dossier" redesign has actually been looked at in a rendered browser — the Playwright automation tool disconnected mid-session before a screenshot could happen. Everything was confirmed structurally (build passes, the right CSS/copy is served) but not eyeballed. Run `bun run dev` and look at all five pages before trusting it's actually good.
2. **Insert the reminder cron secret into `private.app_secrets`.** The `ALTER DATABASE ... SET` approach failed with a permission error (Supabase doesn't grant that) and was replaced with a private table (see `docs/DECISIONS.md`) — but the table's `CREATE TABLE`/`INSERT` steps from `supabase/migrations/20260722201059_schedule_reminder_cron.sql` haven't been run yet. The secret itself already exists locally (`.env`'s `REMINDER_CRON_SECRET`).
3. **Deploy to Render.** An account already exists (decided over Railway/Fly.io/a VPS) — `docs/DEPLOYMENT.md` has the env var list and the `bun run build && bun run start` local verification path. Nothing is live yet.
4. **Finish the reminder cron migration** — once #3 gives a real URL: fill in `<PROD_APP_URL>` in `supabase/migrations/20260722201059_schedule_reminder_cron.sql`, then run the full (now-completed) migration in the SQL editor. Runbook in `docs/DEPLOYMENT.md`.
5. **Set production env vars on Render** — see the table in `docs/DEPLOYMENT.md`. Real values for all of them already exist in local `.env`; this is just copying them into Render's environment settings.
6. **Turn on GitHub branch protection for `main`.** The repo now has real history (bootstrapped with one direct push, see `docs/DECISIONS.md`) — enabling branch protection turns "every change gets a PR" from a convention into something GitHub actually enforces.

~~Apply the initial schema migration~~ — done. The new Supabase project (`iqqkvnjwrgyiigafxsqp`) has its `events`/`settings` tables, enums, RLS, and extensions in place.

~~Supabase access review~~ — resolved by switching to a fresh, self-created Supabase project with no Lovable Cloud history. See `docs/DEPLOYMENT.md`.
