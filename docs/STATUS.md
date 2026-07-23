# Status / next steps

Living punch list — update this as items get done rather than treating it as a one-time snapshot.

1. **Visually verify the redesign.** Nothing about the `docs/DESIGN.md` "dossier" redesign has actually been looked at in a rendered browser — the Playwright automation tool disconnected mid-session before a screenshot could happen. Everything was confirmed structurally (build passes, the right CSS/copy is served) but not eyeballed. Run `bun run dev` (or visit the live Render URL) and look at all five pages before trusting it's actually good.
2. **Turn on GitHub branch protection for `main`.** The repo now has real history (bootstrapped with one direct push, see `docs/DECISIONS.md`) — enabling branch protection turns "every change gets a PR" from a convention into something GitHub actually enforces.

~~Apply the initial schema migration~~ — done. The new Supabase project (`iqqkvnjwrgyiigafxsqp`) has its `events`/`settings` tables, enums, RLS, and extensions in place.

~~Supabase access review~~ — resolved by switching to a fresh, self-created Supabase project with no Lovable Cloud history. See `docs/DEPLOYMENT.md`.

~~Deploy to Render~~ — done. Live at `https://career-compass-nowy.onrender.com` (Blueprint ID `exs-d9h1f1brjlhs73dcb7ag`). `/`, `/board`, `/calendar` verified with 200s.

~~Set production env vars on Render~~ — done as part of the Blueprint deploy above.

~~Run the reminder cron migration~~ — done. `private.app_secrets` created and seeded, cron job `placement-tracker-reminders` scheduled (job id 1, every 15 min) against the real Render URL. Verified end-to-end with a manual `curl` to `/api/public/run-reminders`: `{"ok":true,"checked":0,"results":[]}` — auth, settings lookup, and the event-window query all work. (`checked: 0` is correct — nothing is currently inside the 23–25h reminder window.) Hit one bug along the way: Render's env var text field silently inserted a space in the middle of the pasted `SUPABASE_SERVICE_ROLE_KEY` JWT, which broke Supabase auth and surfaced as a misleading `"No settings row"` error rather than an auth failure — see the gotcha note in `docs/DEPLOYMENT.md`.
