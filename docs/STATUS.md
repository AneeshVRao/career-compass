# Status / next steps

Living punch list — update this as items get done rather than treating it as a one-time snapshot.

## 🔴 The live database has already been locked down — pre-auth code cannot work against it

**Confirmed 2026-07-26.** Every client-side read and write against the production Supabase project fails:

```
GET /rest/v1/events   →  401
{"code":"42501","message":"permission denied for table events"}
```

Same for `settings`. The service-role key returns `200`, so the data and the schema are fine — and the reminder cron, which uses that key, is unaffected. This is a **table-privilege (`GRANT`) denial, not RLS**; an RLS policy that matches nothing returns `200 []`, never `42501`.

**This is intentional, not drift.** `anon`'s grants were revoked by hand as part of the multi-user auth rollout (see `docs/DATABASE.md` → "Row Level Security"), because an unauthenticated visitor no longer has a shared dataset to legitimately read. It looks like unexplained breakage only because **the revoke was never captured in a migration** — `supabase/migrations/` still says `GRANT ... TO anon, authenticated`, so the committed schema and the live database disagree.

Two things follow, and the second is the one that bites:

1. A fresh project replayed from `supabase/migrations/` will **not** match production. Re-apply `revoke all on public.events, public.settings from anon;` by hand, or add it as a migration.
2. **Shipping `main` without the auth work leaves the deployed app non-functional.** Pre-auth code authenticates as `anon` and `anon` can no longer read anything. Landing multi-user auth is therefore not optional polish — it is what makes the deployment work again.

**⚠️ Still worth verifying before trusting the auth deploy.** The new policies key off `auth.uid() = user_id`, which requires the **`authenticated`** role to hold table grants. `docs/DATABASE.md` states it keeps all four verbs, but that's a record of intent — and intent and reality have already diverged once here, which is the entire reason this section exists. Only `anon` was empirically confirmed; testing `authenticated` means creating a real user in the production database. If it lost its grants too, the app fails _identically_ after login and the cause will not be obvious:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name in ('events','settings')
  and grantee in ('anon','authenticated');
```

If `authenticated` is absent from those results, add a migration granting it. That's safe — RLS still scopes every row to its owner:

```sql
grant select, insert, update, delete on public.events, public.settings to authenticated;
```

## Punch list

1. **Apply the multi-user auth migration, then backfill, then lock down.** Three ordered steps, all needing the Supabase SQL editor (no CLI path in this environment):
   1. Run `supabase/migrations/20260725120000_multi_user_auth.sql`.
   2. Create your account at `/login`, then run the backfill SQL to claim the existing ownerless `events`/`settings` rows. **Between these steps your existing events will appear to have vanished from the app** — that's RLS working as intended on unowned rows, not data loss.
   3. Only then run `supabase/migrations/20260725120100_lockdown_user_id_not_null.sql`.
      Full runbook: `docs/DEPLOYMENT.md` → "Multi-user data backfill runbook".
2. **Enable Google OAuth in the Supabase dashboard.** The "Sign in with Google" button on `/login` returns a provider-not-enabled error until this is done (email/password works regardless). Needs a Google Cloud OAuth client, the provider toggled on in Supabase, and both localhost + Render `/auth/callback` URLs allowlisted. Runbook: `docs/DEPLOYMENT.md` → "Google OAuth setup runbook". Decide the "Confirm email" setting at the same time — recommended **on**, since signup is open.
3. **Visually verify the redesign, now including `/login`.** Nothing about the `docs/DESIGN.md` "dossier" redesign has actually been looked at in a rendered browser — the Playwright automation tool disconnected mid-session before a screenshot could happen. Everything was confirmed structurally (build passes, the right CSS/copy is served) but not eyeballed. Run `bun run dev` (or visit the live Render URL) and look at all five pages plus the new sign-in page before trusting it's actually good.
4. **Run the new E2E auth specs against a real project.** `e2e/auth.spec.ts` and `e2e/multi-user-isolation.spec.ts` were written but not executed here (they need the migration applied first, since every assertion depends on the redirect-to-`/login` behaviour, and there is no `.env` in the audit worktree). Run `bunx playwright test e2e/auth.spec.ts e2e/multi-user-isolation.spec.ts` after step 1. Both create disposable `__e2e_test__+…@example.com` accounts and delete them via the admin API in `afterEach`; the isolation spec creates two and asserts neither can see the other's event.
5. ~~**`board.spec.ts` and `dashboard.spec.ts` still assume no auth.**~~ **Fixed.** Both now create a disposable confirmed user in `beforeEach` and sign in via `signIn()` before visiting the protected route, deleting the user in `afterEach` — same pattern as `auth.spec.ts`/`multi-user-isolation.spec.ts`. Still unrun here for the same reason as item 4 (no `.env`, migration not yet applied) — run alongside item 4's command once step 1 is done.
6. **Delete the dead shadcn scaffolding.** 37 of the 48 components in `src/components/ui/` have no importer anywhere in the app, along with ~27 dependencies that exist only to serve them (`embla-carousel-react`, `input-otp`, `cmdk`, `vaul`, `react-resizable-panels`, `react-day-picker`, and 21 `@radix-ui/*` packages). Verified by grepping every UI file for importers. Deliberately deferred to its own PR so the diff stays reviewable, and sequenced after the auth work, which already deletes some files. Two caveats found while auditing: `use-mobile.tsx` is _not_ directly dead (`sidebar.tsx` imports it, and `sidebar.tsx` is itself orphaned — transitively dead, so it goes with the batch), and `getEvent()` in `events-api.ts` is only reachable from its own test.
7. **Widen coverage beyond three files.** `coverage.include` is scoped to `domain.ts`, `reminders.ts`, `events-api.ts` — a deliberate choice (see `docs/DEVELOPMENT.md`), but it means the 80% threshold says nothing about `run-reminders.ts`, the one piece that sends real email. `src/routes/api/public/-run-reminders.test.ts` now exists; add it to `coverage.include` so the threshold actually covers it.
8. **Turn on GitHub branch protection for `main`.** The repo now has real history (bootstrapped with one direct push, see `docs/DECISIONS.md`) — enabling branch protection turns "every change gets a PR" from a convention into something GitHub actually enforces.

## Audit follow-ups, deliberately deferred

Two findings from the 4-way audit of `feat/multi-user-auth` were considered and consciously **not** implemented. Recorded here so they read as decisions rather than oversights — reopen them if the premises below stop holding.

- **Rate limiting on `/login`** — not needed, and not actually implementable here. `/login` is a client-side page: it calls `supabase.auth.signInWithPassword()` / `signUp()` straight from the browser to Supabase's hosted Auth API. This app owns **no** endpoint in the credential path (`src/lib/auth-server.ts` only _reads_ the session cookie), so any limiter added to this codebase would sit in front of a page an attacker can simply skip — they would post directly to `{SUPABASE_URL}/auth/v1/token` with the anon key, which is public by design. Supabase's own server-side per-IP limits on the token/signup endpoints are therefore the only enforcement point that exists, and they are sufficient. If the threat model tightens, the fix is to **lower the limits in the Supabase dashboard** (Auth → Rate Limits) — not to add a rate-limiting dependency to this repo. Revisit only if a custom server-side sign-in route is ever introduced.
- **Structured logging (Pino/Winston/Sentry) instead of `console.error`** — flagged by two audits; deferred as disproportionate. This is a small tool that went from one user to a handful, running as a single Render web service where `console.error` already lands in the platform's log stream and is greppable there. A logging framework would add a dependency and a config surface to buy structure nobody is currently querying. `console.error` stays. Revisit when there is somewhere that actually consumes structured logs (log aggregation, alerting, or error grouping) — that need, not the log calls themselves, is the trigger.

~~Multi-user auth implementation~~ — done in code: cookie-based Supabase sessions, `/login` (email/password + Google), one server-side route guard, per-user RLS migrations, per-user reminder fan-out, sign-out in `AppShell`. Build, unit tests, and lint verified. The remaining work is all dashboard/SQL-editor configuration — items 1, 2 and 5 above.

~~Run the reminder cron migration in the Supabase SQL editor~~ — done. The job is scheduled and verified end-to-end. See `docs/DEPLOYMENT.md`.

~~Apply the initial schema migration~~ — done. The new Supabase project (`iqqkvnjwrgyiigafxsqp`) has its `events`/`settings` tables, enums, RLS, and extensions in place.

~~Supabase access review~~ — resolved by switching to a fresh, self-created Supabase project with no Lovable Cloud history. See `docs/DEPLOYMENT.md`.

~~Deploy to Render~~ — done. Live at `https://career-compass-nowy.onrender.com` (Blueprint ID `exs-d9h1f1brjlhs73dcb7ag`). `/`, `/board`, `/calendar` verified with 200s.

~~Set production env vars on Render~~ — done as part of the Blueprint deploy above.
