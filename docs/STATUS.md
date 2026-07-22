# Status / next steps

Living punch list — update this as items get done rather than treating it as a one-time snapshot.

1. **Visually verify the redesign.** Nothing about the `docs/DESIGN.md` "dossier" redesign has actually been looked at in a rendered browser — the Playwright automation tool disconnected mid-session before a screenshot could happen. Everything was confirmed structurally (build passes, the right CSS/copy is served) but not eyeballed. Run `bun run dev` and look at all five pages before trusting it's actually good.
2. **Pick a deploy host and ship a build.** Nothing is live anywhere right now. `docs/DEPLOYMENT.md` has the env var list and the `bun run build && bun run start` verification path; picking Railway/Render/Fly.io/a VPS and actually deploying is still open.
3. **Apply the reminder cron migration.** Reminders will never fire until the runbook in `docs/DEPLOYMENT.md` is followed by hand in the Supabase SQL editor — generate the secret, set it via `ALTER DATABASE`, fill in the real app URL, run the migration.
4. **Set production env vars** wherever #2 ends up hosted — see the table in `docs/DEPLOYMENT.md`.
5. **Turn on GitHub branch protection for `main`.** The repo now has real history (bootstrapped with one direct push, see `docs/DECISIONS.md`) — enabling branch protection turns "every change gets a PR" from a convention into something GitHub actually enforces.
6. **Supabase access review.** Project `irzxntglqqwyrvmkxkpy` was originally provisioned through Lovable Cloud; worth checking Project Settings → access in the Supabase dashboard now that the codebase no longer references Lovable at all, and considering a key rotation if a hard ownership cutover matters.
