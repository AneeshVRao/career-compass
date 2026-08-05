# Decisions

A short log of non-obvious calls made and why, so a future session doesn't have to re-litigate them from scratch. Newest first. Dates are when the decision was made, not necessarily when it shipped.

## 2026-08-05 — One pinned display timezone, not the viewer's local zone

**Decision**: every instant the app renders goes through `src/lib/datetime.ts`, which formats in a single configured zone (`VITE_DISPLAY_TIME_ZONE`, default `Asia/Kolkata`). The alternative — render in each viewer's local zone, and suppress the SSR mismatch by formatting only after mount — was rejected.

**Why**: two bugs shared one root cause, and only a pinned zone fixes both. The known one was hydration: `format(new Date(iso), …)` inside an SSR'd component renders in the server's zone (Render is UTC) and the browser's on the client, so every card flashed the wrong time and `/calendar` bucketed late-evening events into the wrong day cell until the client took over. The one nobody had noticed is that **reminder emails stated the wrong time**: `run-reminders.ts` runs on that same UTC server, so a 21:00 IST interview went out as "3:30 PM". Client-only formatting would have fixed the flash and left the emails broken, because there is no client involved in sending an email — the email needs a zone chosen deliberately, and once you have chosen one, having the UI disagree with it is worse than either.

Per-user zones were considered and rejected as modelling the wrong thing: a placement season happens at one campus, in one timezone, and every event in the database is a physical event there. A user travelling abroad should still see the times their interviews actually happen at, not times shifted into wherever they are sitting.

**Consequence**: `EventDrawer`'s `datetime-local` round-trip changed too — it previously used `getTimezoneOffset()`, i.e. the _browser's_ offset, so editing an event from a machine in another zone silently rewrote its start time. It now round-trips through the same zone as the display. Calendar grid math still uses date-fns on local-field Dates, but those are seeded from `todayInZone()` so they stay deterministic.

**Note**: no test asserted the "When" row of a reminder email, which is how the wrong-time bug shipped unnoticed. There is now a test that pins it explicitly.

## 2026-07-26 — Pin the working tree to LF with `.gitattributes` rather than re-running Prettier

**Decision**: added `.gitattributes` with `* text=auto eol=lf`, instead of keeping the documented "just run `bunx prettier --write` on the file" workaround for CRLF lint noise.

**Why**: the workaround treats a recurring condition as a one-off. `core.autocrlf=true` re-introduces CRLF on _every_ checkout, rebase, and branch switch — so the fix has to be re-applied forever, and it silently expands to files you never intended to touch. A rebase produced 2,862 `Delete ␍` errors across untouched files, which is exactly the situation where a real error goes unnoticed. `eol=lf` makes the checkout LF regardless of each developer's local `autocrlf`, so the condition stops arising. The Git index was already LF throughout (autocrlf normalizes on commit), so this changed no committed content — only what lands in the working tree.

## 2026-07-26 — `**/node_modules/**` in the vitest exclude, not a `.claude` special case

**Decision**: fixed the runaway test collection by making the exclude glob recursive rather than by adding the specific offending directory.

**Why**: `exclude: ["node_modules/**"]` overrides vitest's defaults and only masks the root `node_modules`, so a nested checkout under `.claude/worktrees/` contributed 660 vendored test files and 367 seconds of runtime. Excluding `.claude` by name would have fixed the symptom in front of us and left the next nested checkout — a second worktree, a vendored example app, a `tmp/` clone — to rediscover it. The recursive glob covers the whole class. `.claude` is listed too, but as defence in depth.

**Consequence**: `bun run test` went from 663 files / 370s / 20 failures to 3 files / 1.9s / all passing.

## 2026-07-26 — Reminder endpoint returns an opaque 401 when the secret is unset

**Decision**: `/api/public/run-reminders` no longer answers `500 {"error":"REMINDER_CRON_SECRET not configured"}`. A missing secret and a wrong secret are now the same `401 {"error":"Unauthorized"}`, with the real reason written to the server log.

**Why**: the old pair of responses let an unauthenticated caller probe deployment state — whether the env var is set is information the caller has no business learning, and it's a useful signal to anyone deciding whether an endpoint is worth attacking. Logging server-side keeps the operator's debugging story intact, which was the only thing the distinct 500 was actually buying.

**Note**: this deliberately contradicted an existing test that asserted the 500. The test was updated rather than the behaviour reverted, and a second test now asserts the property directly — that both failure modes are byte-for-byte identical from outside.

## 2026-07-26 — Dropped `esbuild: { keepNames: true }` instead of porting it to oxc

**Decision**: deleted the option from `vite.config.ts` rather than translating it to a Vite 8 equivalent.

**Why**: Vite 8 is rolldown/oxc-based — `esbuild` isn't even an installed package — and `keepNames` exists on neither `ESBuildOptions` nor `OxcOptions` (verified against the shipped `.d.ts`, not assumed). The option was silently doing nothing _and_ failing `tsc --noEmit`. There's no equivalent to port; the dev build already preserves names because it isn't minified. If name preservation ever genuinely matters, reach for `build.minify` rather than reinstating a key Vite doesn't read.

## 2026-07-26 — `src/integrations/supabase/types.ts` is Prettier-ignored, not reformatted

**Decision**: added the Supabase-generated types file to `.prettierignore` alongside the already-ignored `src/routeTree.gen.ts`, rather than formatting its 148 Prettier violations.

**Why**: it's regenerated by `supabase gen types`, so any reformatting is undone on the next regen and shows up as spurious diff noise in between. Same category, same treatment as the router's generated tree. The four _hand-written_ files in that directory (`client.ts`, `client.server.ts`, `auth-attacher.ts`, `auth-middleware.ts`) had genuinely never been formatted and were fixed properly.

## 2026-07-25 — Multi-user auth: cookie-based SSR sessions, open signup, backfill over wipe

**Decision**: the app becomes multi-user. Sessions move from localStorage to a **cookie** via `@supabase/ssr`; signup is **open** (email/password + Google OAuth, no invite gating); existing single-user data is **backfilled** to the real user's account rather than wiped.

**Why cookie-based SSR rather than keeping localStorage:** the requirement was "no auth flicker on first paint," and that requirement alone decides the architecture. A localStorage session is unreadable by the server, so the earliest an auth check can happen is after hydration — meaning a protected page necessarily renders an unauthenticated frame and then snaps to a redirect. Moving the session into a cookie lets the check run server-side in the root route's `beforeLoad`, before any HTML is produced. Everything else here (the third Supabase client, deleting the bearer-token middleware) follows from that one choice rather than being independently motivated.

**Consequence — a third Supabase client, and a real trust-boundary trap.** There are now three: the browser client (`createBrowserClient`, cookie session), a per-request cookie-aware server client (`client.request.server.ts`, RLS-enforced, runs as the logged-in user), and the untouched service-role `supabaseAdmin`. The trap, hit for real during implementation: the request client statically imports `@tanstack/react-start/server`, and `vite.config.ts`'s `importProtection` fails the build if any client-reachable module imports a `**/server/**` path. The first cut co-located `getSupabaseServerClient` with the `fetchAuthUser` serverFn, `__root.tsx` imported it, and the build broke. Fixed by splitting into three modules (`auth-types.ts` for the plain type, `auth-server.ts` client-reachable with a dynamic import inside the handler, `client.request.server.ts` for the actual server imports). Treating that build failure as a real bug rather than routing around it is the point — it was correctly reporting a leak.

**Deleted the bearer-token scaffolding** (`auth-middleware.ts` / `auth-attacher.ts`) rather than adapting it. It was written for exactly this moment, but cookie SSR makes it redundant: the server reads the session directly, so nothing needs to attach `Authorization: Bearer` per serverFn call. Keeping both would have meant two competing auth mechanisms, each half-wired.

**One route guard, not five.** Protection lives in `__root.tsx`'s `beforeLoad` with a `PUBLIC_PATHS` allowlist (`/login`, `/auth/callback`), rather than a `beforeLoad` on each of the five pages. Smaller diff, and it fails safe — a newly added page is protected by default, whereas the per-page variant fails open the moment someone forgets one.

**Why open signup**: asked for directly. Worth being explicit that this makes the deployment a small public service rather than a personal tool, which is why leaving Supabase's "Confirm email" setting **on** is the recommended posture — without it, anyone can enrol using an address they don't control. RLS makes other users' data unreachable regardless, so the blast radius of an unwanted signup is an empty account.

**Why backfill rather than wipe**: also asked for directly, and cheap to honour. The subtlety worth recording is that `user_id`'s `auth.uid()` default does _nothing_ for pre-existing rows — a default only applies to new inserts. So the column ships nullable, pre-existing rows sit with `user_id IS NULL` and are invisible to everyone (RLS matches `auth.uid() = user_id`, and NULL matches nobody), and a separate lockdown migration flips it to `NOT NULL` only after the manual backfill. Splitting the migration in two is what makes the ordering enforceable instead of merely documented: run the lockdown early and it fails loudly on the NOT NULL violation. The one genuinely fiddly bit is `settings`, where the signup trigger creates a second row for the same person — the runbook copies the legacy row's preferences onto the trigger-created row and deletes the orphan, because `settings.user_id` is `UNIQUE` and claiming the old row directly would violate it.

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

**Consequence worth knowing**: `bun run preview` (plain `vite preview`) doesn't work with _either_ preset, because the incompatibility is between "using nitro at all" and what `vite preview`'s bundled TanStack Start preview plugin expects (a non-nitro `dist/server/server.js` layout) — see `docs/DEPLOYMENT.md`. Switching presets again in the future won't fix this.

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
