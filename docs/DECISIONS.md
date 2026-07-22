# Decisions

A short log of non-obvious calls made and why, so a future session doesn't have to re-litigate them from scratch. Newest first. Dates are when the decision was made, not necessarily when it shipped.

## 2026-07-22 — Reminder cron auth: shared-secret header, not full HMAC

**Decision**: guard `/api/public/run-reminders` with a single shared-secret header (`x-reminder-cron-secret`), compared with `node:crypto`'s `timingSafeEqual`, rather than a full HMAC-signed request scheme.

**Why**: this is a single, low-value internal endpoint with exactly one caller (a `pg_cron` job) and no external public consumers. Full HMAC signing adds real complexity — timestamp windows, replay protection, signature computation on both ends — that buys nothing here since there's no adversary model beyond "don't let a random internet request trigger this." A correctly-compared shared secret already defeats that.

**Alternative considered**: full HMAC with a timestamp + nonce. Rejected as over-engineering for the actual threat model.

## 2026-07-22 — Cron secret storage: Postgres `current_setting()`, not a literal in the migration file

**Decision**: the reminder cron's secret is never committed to git in any form. The migration reads it via `current_setting('app.reminder_cron_secret')`, and the actual value is set once by hand via `ALTER DATABASE postgres SET app.reminder_cron_secret = '...'` run directly in the Supabase SQL editor.

**Why**: a secret literal in a migration file lives in git history forever, even if later rotated or the file edited — removing it from a future commit doesn't remove it from history. The one-time manual step is a small amount of extra setup friction in exchange for the secret genuinely never touching a commit.

**Alternative considered**: just write the secret into the migration file directly, since this is a personal single-user project with lower stakes than a team codebase. Rejected anyway — the `current_setting()` approach costs almost nothing extra and avoids a bad habit.

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
