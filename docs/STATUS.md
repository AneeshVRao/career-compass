# Status / next steps

Living punch list — update this as items get done rather than treating it as a one-time snapshot.

## 🔴 Blocking: the live database denies the `anon` role

**Found 2026-07-26.** Every client-side read and write against the production Supabase project fails:

```
GET /rest/v1/events   →  401
{"code":"42501","message":"permission denied for table events"}
```

Same for `settings`. The service-role key returns `200`, so the data and the schema are fine. This is a **table-privilege (`GRANT`) denial, not RLS** — an RLS policy that matches nothing returns `200 []`, never `42501`. Since the deployed app reads with the publishable key and has no login, **the live site currently cannot read or write anything.**

What's confusing about it: `supabase/migrations/20260722131142_*.sql` lines 36 and 57 _do_ `GRANT SELECT, INSERT, UPDATE, DELETE ON public.events, public.settings TO anon, authenticated`. The tables plainly exist, so that migration ran. Something revoked the grants afterwards and it isn't in version control — the branch migrations drop and recreate _policies_ but never touch grants.

**Do not reflexively re-grant `anon`.** The multi-user-auth work exists specifically to replace the wide-open `USING (true)` policies with per-user ones; if the revocation was deliberate, re-granting re-exposes the whole database to anyone who finds the URL. Two coherent paths:

- **Land multi-user auth** (chosen). Access comes from real logins, `anon` stays locked down.
- **Re-grant `anon`** to restore the single-user app as-is, accepting that the database is public to anyone with the URL.

**Verify before merging the auth branch** — its policies key off `auth.uid() = user_id`, which needs the **`authenticated`** role to hold grants. Only `anon` was confirmed broken; `authenticated` was never tested, because doing so means creating a real user in the production database. If it's missing too, the auth branch fails identically after login and the cause won't be obvious:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name in ('events','settings')
  and grantee in ('anon','authenticated');
```

If `authenticated` is absent, add a `GRANT ... TO authenticated` migration to the branch. That's safe — RLS still scopes every row to its owner.

## Punch list

1. **Delete the dead shadcn scaffolding.** 37 of the 48 components in `src/components/ui/` have no importer anywhere in the five routes, along with ~27 dependencies that exist only to serve them (`embla-carousel-react`, `input-otp`, `cmdk`, `vaul`, `react-resizable-panels`, `react-day-picker`, and 21 `@radix-ui/*` packages). Verified by grepping every UI file for importers. Deliberately deferred to its own PR so the diff stays reviewable — and it should land _after_ the auth work, which already deletes some files. Two caveats found while auditing: `use-mobile.tsx` is _not_ directly dead (`sidebar.tsx` imports it, and `sidebar.tsx` is itself orphaned — transitively dead, so it goes with the batch), and `getEvent()` in `events-api.ts` is only reachable from its own test.
2. **Widen coverage beyond three files.** `coverage.include` is scoped to `domain.ts`, `reminders.ts`, `events-api.ts` — a deliberate choice (see `docs/DEVELOPMENT.md`), but it means the 80% threshold says nothing about the reminder API route, which until recently had no tests at all and is the one piece that sends real email. The auth branch adds `-run-reminders.test.ts`; add it to `coverage.include` when that lands.
3. **Visually verify the redesign.** Nothing about the `docs/DESIGN.md` "dossier" redesign has actually been looked at in a rendered browser — the Playwright automation tool disconnected mid-session before a screenshot could happen. Everything was confirmed structurally (build passes, the right CSS/copy is served) but not eyeballed. Run `bun run dev` (or visit the live Render URL) and look at all five pages before trusting it's actually good.
4. **Run the reminder cron migration in the Supabase SQL editor.** `supabase/migrations/20260722201059_schedule_reminder_cron.sql` now has the real `<PROD_APP_URL>` filled in (`https://career-compass-nowy.onrender.com`), but it still needs to be pasted into the SQL editor and run by hand — no CLI/API path to Supabase exists in this environment. This also covers inserting the `reminder_cron_secret` row into `private.app_secrets` (same value as Render's `REMINDER_CRON_SECRET`). Runbook in `docs/DEPLOYMENT.md`.
5. **Turn on GitHub branch protection for `main`.** The repo now has real history (bootstrapped with one direct push, see `docs/DECISIONS.md`) — enabling branch protection turns "every change gets a PR" from a convention into something GitHub actually enforces.

~~Apply the initial schema migration~~ — done. The new Supabase project (`iqqkvnjwrgyiigafxsqp`) has its `events`/`settings` tables, enums, RLS, and extensions in place.

~~Supabase access review~~ — resolved by switching to a fresh, self-created Supabase project with no Lovable Cloud history. See `docs/DEPLOYMENT.md`.

~~Deploy to Render~~ — done. Live at `https://career-compass-nowy.onrender.com` (Blueprint ID `exs-d9h1f1brjlhs73dcb7ag`). `/`, `/board`, `/calendar` verified with 200s.

~~Set production env vars on Render~~ — done as part of the Blueprint deploy above.
