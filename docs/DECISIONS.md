# Decisions

A short log of non-obvious calls made and why, so a future session doesn't have to re-litigate them from scratch. Newest first. Dates are when the decision was made, not necessarily when it shipped.

## 2026-07-25 — Multi-user auth: cookie-based SSR sessions, open signup, backfill over wipe

**Decision**: the app becomes multi-user. Sessions move from localStorage to a **cookie** via `@supabase/ssr`; signup is **open** (email/password + Google OAuth, no invite gating); existing single-user data is **backfilled** to the real user's account rather than wiped.

**Why cookie-based SSR rather than keeping localStorage:** the requirement was "no auth flicker on first paint," and that requirement alone decides the architecture. A localStorage session is unreadable by the server, so the earliest an auth check can happen is after hydration — meaning a protected page necessarily renders an unauthenticated frame and then snaps to a redirect. Moving the session into a cookie lets the check run server-side in the root route's `beforeLoad`, before any HTML is produced. Everything else here (the third Supabase client, deleting the bearer-token middleware) follows from that one choice rather than being independently motivated.

**Consequence — a third Supabase client, and a real trust-boundary trap.** There are now three: the browser client (`createBrowserClient`, cookie session), a per-request cookie-aware server client (`client.request.server.ts`, RLS-enforced, runs as the logged-in user), and the untouched service-role `supabaseAdmin`. The trap, hit for real during implementation: the request client statically imports `@tanstack/react-start/server`, and `vite.config.ts`'s `importProtection` fails the build if any client-reachable module imports a `**/server/**` path. The first cut co-located `getSupabaseServerClient` with the `fetchAuthUser` serverFn, `__root.tsx` imported it, and the build broke. Fixed by splitting into three modules (`auth-types.ts` for the plain type, `auth-server.ts` client-reachable with a dynamic import inside the handler, `client.request.server.ts` for the actual server imports). Treating that build failure as a real bug rather than routing around it is the point — it was correctly reporting a leak.

**Deleted the bearer-token scaffolding** (`auth-middleware.ts` / `auth-attacher.ts`) rather than adapting it. It was written for exactly this moment, but cookie SSR makes it redundant: the server reads the session directly, so nothing needs to attach `Authorization: Bearer` per serverFn call. Keeping both would have meant two competing auth mechanisms, each half-wired.

**One route guard, not five.** Protection lives in `__root.tsx`'s `beforeLoad` with a `PUBLIC_PATHS` allowlist (`/login`, `/auth/callback`), rather than a `beforeLoad` on each of the five pages. Smaller diff, and it fails safe — a newly added page is protected by default, whereas the per-page variant fails open the moment someone forgets one.

**Why open signup**: asked for directly. Worth being explicit that this makes the deployment a small public service rather than a personal tool, which is why leaving Supabase's "Confirm email" setting **on** is the recommended posture — without it, anyone can enrol using an address they don't control. RLS makes other users' data unreachable regardless, so the blast radius of an unwanted signup is an empty account.

**Why backfill rather than wipe**: also asked for directly, and cheap to honour. The subtlety worth recording is that `user_id`'s `auth.uid()` default does *nothing* for pre-existing rows — a default only applies to new inserts. So the column ships nullable, pre-existing rows sit with `user_id IS NULL` and are invisible to everyone (RLS matches `auth.uid() = user_id`, and NULL matches nobody), and a separate lockdown migration flips it to `NOT NULL` only after the manual backfill. Splitting the migration in two is what makes the ordering enforceable instead of merely documented: run the lockdown early and it fails loudly on the NOT NULL violation. The one genuinely fiddly bit is `settings`, where the signup trigger creates a second row for the same person — the runbook copies the legacy row's preferences onto the trigger-created row and deletes the orphan, because `settings.user_id` is `UNIQUE` and claiming the old row directly would violate it.

**Alternative considered**: a `_authed.tsx` layout route wrapping the five pages, the more idiomatic TanStack shape. Rejected as a bigger diff for this repo — it means renaming/moving all five route files and reshaping the generated route tree, to gain nothing over the allowlist guard, which already fails safe.

## 2026-07-23 — Switched to a fresh, self-created Supabase project

**Decision**: stop using `irzxntglqqwyrvmkxkpy` (the original project, provisioned through Lovable Cloud) and move to a new project, `iqqkvnjwrgyiigafxsqp`, created directly with no Lovable involvement.

**Why**: closes out the "Supabase access review" open item from the previous session's `docs/STATUS.md` in the simplest possible way — rather than auditing and possibly rotating keys on a project Lovable Cloud originally provisioned, just start clean on a project that never had that history. Confirmed the new service-role JWT decodes to `{"role":"service_role","ref":"iqqkvnjwrgyiigafxsqp",...}` before trusting it.

**Consequence**: the new project starts with zero schema — both migrations need to be (re-)applied to it. The old project's data (5 seed events from earlier testing) does not carry over; this is a genuinely fresh start, not a migration of existing data.

## 2026-07-23 — Cron secret storage, take two: a private table, not `current_setting()`

**Decision**: replaced the `current_setting('app.reminder_cron_secret')` + `ALTER DATABASE ... SET` approach with a `private.app_secrets` key-value table, read via a subquery inside the `cron.schedule(...)` job body instead.

**Why**: the original approach doesn't actually work on Supabase's hosted Postgres. Running `ALTER DATABASE postgres SET app.reminder_cron_secret = '...'` in the SQL editor fails with `ERROR: 42501: permission denied to set parameter "app.reminder_cron_secret"` — setting arbitrary custom GUC parameters at the database level requires true superuser privileges, which Supabase intentionally doesn't grant even to the `postgres` role inside its own SQL editor. A private table sidesteps this entirely: `CREATE TABLE`/`INSERT` are ordinary DML well within normal privileges, and the table lives in a `private` schema that's never exposed via PostgREST, with no grants given to `anon`/`authenticated` — so it's no less secure than the GUC approach would have been, just achieved differently. Full schema in `docs/DATABASE.md`.

**Alternative considered**: Supabase Vault (the platform's built-in `pgsodium`-backed encrypted secrets store, `vault.secrets`/`vault.decrypted_secrets`). Would also work and is arguably more "proper," but adds setup complexity (managing encryption keys, a less familiar API) that isn't justified for a personal project's one low-stakes secret — a plain unexposed table already achieves the actual goal (keep the secret out of git, unreachable by the app's normal RLS-scoped clients).

## 2026-07-22 — Reminder cron auth: shared-secret header, not full HMAC

**Decision**: guard `/api/public/run-reminders` with a single shared-secret header (`x-reminder-cron-secret`), compared with `node:crypto`'s `timingSafeEqual`, rather than a full HMAC-signed request scheme.

**Why**: this is a single, low-value internal endpoint with exactly one caller (a `pg_cron` job) and no external public consumers. Full HMAC signing adds real complexity — timestamp windows, replay protection, signature computation on both ends — that buys nothing here since there's no adversary model beyond "don't let a random internet request trigger this." A correctly-compared shared secret already defeats that.

**Alternative considered**: full HMAC with a timestamp + nonce. Rejected as over-engineering for the actual threat model.

## 2026-07-22 — Cron secret storage: Postgres `current_setting()`, not a literal in the migration file — **superseded, see 2026-07-23 below**

**Decision**: the reminder cron's secret is never committed to git in any form. The migration reads it via `current_setting('app.reminder_cron_secret')`, and the actual value is set once by hand via `ALTER DATABASE postgres SET app.reminder_cron_secret = '...'` run directly in the Supabase SQL editor.

**Why**: a secret literal in a migration file lives in git history forever, even if later rotated or the file edited — removing it from a future commit doesn't remove it from history. The one-time manual step is a small amount of extra setup friction in exchange for the secret genuinely never touching a commit.

**Alternative considered**: just write the secret into the migration file directly, since this is a personal single-user project with lower stakes than a team codebase. Rejected anyway — the `current_setting()` approach costs almost nothing extra and avoids a bad habit.

**What actually happened**: this didn't work in practice. See the entry directly below.

## 2026-07-22 — Deploy target: nitro `node-server` preset, not Cloudflare Workers

**Decision**: `vite.config.ts`'s nitro plugin targets `node-server`, having previously targeted `cloudflare-module` (inherited from the original Lovable-wrapped config's default).

**Why**: no Cloudflare account exists to actually deploy a Workers build to. `node-server` produces a plain long-running Node process deployable to any VPS/PaaS, which matches "no specific cloud committed to yet."

**Consequence worth knowing**: `bun run preview` (plain `vite preview`) doesn't work with *either* preset, because the incompatibility is between "using nitro at all" and what `vite preview`'s bundled TanStack Start preview plugin expects (a non-nitro `dist/server/server.js` layout) — see `docs/DEPLOYMENT.md`. Switching presets again in the future won't fix this.

## 2026-07-22 — Removing Lovable: full self-owned `vite.config.ts` rewrite, not a thin branding strip

**Decision**: when asked to remove all Lovable traces, the entire `@lovable.dev/vite-tanstack-config` build wrapper was replaced with a plain `defineConfig` reproducing every piece of load-bearing config it applied, rather than just leaving the wrapper in place (since it's not user-facing) and only scrubbing docs/branding.

**Why**: asked directly — the user chose the "fully self-owned config" option when presented with both. The wrapper's source was read directly from `node_modules` first to confirm exactly what it composed, so nothing was silently dropped in the rewrite (see `docs/ARCHITECTURE.md`'s `vite.config.ts` section for the full plugin-by-plugin mapping).

**Also discovered along the way**: the project's `bun.lock` had several packages pinned to a private Lovable npm registry mirror from when the project was originally set up inside Lovable's sandbox — fixed by deleting the lockfile and reinstalling fresh against the public registry (see `docs/DEVELOPMENT.md`).

## 2026-07-22 — Design direction: "admit-card dossier," not a generic dashboard

**Decision**: the frontend redesign leans into a placement-season-specific "personal dossier" metaphor (navy ledger, parchment admit-card event stubs, IBM Plex type system) rather than a generic dark-mode SaaS dashboard refresh.

**Why**: explicitly avoiding the two most common AI-generated design defaults (cream+serif+terracotta, and near-black+single-accent) in favor of something derived from the actual subject matter — campus placement season is fundamentally about scheduled appointments you're issued and must attend, which the admit-card/ticket-stub metaphor captures directly. Full rationale and the color/type token tables live in `docs/DESIGN.md`.

**Open risk**: never visually verified — see `docs/STATUS.md`.

## 2026-07-22 — Git bootstrap: one direct push to `main`, then branch+PR for everything after

**Decision**: the repo's very first push (establishing history in an empty GitHub repo) was a direct push to `main`, despite a standing global rule of "never push directly to main, every change gets a PR, no exceptions."

**Why**: a pull request requires two divergent branches sharing a common base — impossible against a genuinely empty repo with zero existing commits. Confirmed via `gh repo view` that the remote was empty (`isEmpty: true`, no default branch ref) before pushing. Asked the user explicitly rather than assuming either way, since the global rule is phrased with no stated exceptions. All work after this point follows the feature-branch + PR workflow.
