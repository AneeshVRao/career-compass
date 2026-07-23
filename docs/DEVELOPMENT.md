# Development

## Local setup

```sh
bun install
bun run dev   # http://localhost:8080
```

Package manager is bun exclusively — `bun.lock` and `bunfig.toml` are both present, and neither `package-lock.json` nor `yarn.lock` should ever be added alongside them.

## Testing philosophy

Coverage (`vitest.config.ts`) is deliberately scoped to exactly three files — `src/lib/domain.ts`, `src/lib/reminders.ts`, `src/lib/events-api.ts` — with an 80% threshold on all four metrics, rather than the whole `src/` tree. This was a conscious choice: these three are the pure-logic/data-access core where a bug is silent and expensive (wrong enum label, wrong reminder time window, wrong Supabase error handling), whereas the React components are UI-heavy and better covered by the E2E specs' actual user-flow assertions than by unit tests asserting on JSX output. If you add new pure logic to `src/lib`, add it to `coverage.include` deliberately — don't assume it's covered by default.

`src/lib/events-api.test.ts` mocks `@/integrations/supabase/client` with a hand-rolled chainable/thenable query-builder (`makeBuilder`/`queueFromResults` helpers in that file) rather than a Supabase test-double library. The builder returns itself from every chain method (`.select()`, `.eq()`, `.order()`, etc.) and only actually resolves at `.single()`/`.maybeSingle()`/`.then()` — this mirrors how the real `postgrest-js` query builder behaves (thenable, lazy) closely enough to catch real bugs without pulling in a heavier mocking dependency. Extend this pattern for new `events-api.ts` functions rather than reaching for something else.

**E2E tests run against the real single-user Supabase project.** There is no separate test database — standing one up wasn't worth the overhead for a personal single-user tool. `e2e/board.spec.ts` tags any data it creates with `company: "__e2e_test__"` and deletes it in `afterEach` (which runs the same cleanup even if the test itself failed partway through, so a crash mid-test doesn't leave orphaned rows). Follow the same tag-and-clean convention for any new E2E test that writes data — and if you're ever debugging a test that seems to intermittently fail on an assertion about *count*, check for leftover `__e2e_test__` rows from a previous failed run first (query `events?company=eq.__e2e_test__` via the REST API, or check the `/list` page) before assuming the app itself is broken.

Playwright's `webServer` config in `playwright.config.ts` starts `bun run dev` itself and expects port `8080` — don't hardcode a different port without actually checking what `bun run dev` prints, since Vite's dev server port isn't guaranteed across environments.

## Known gotchas (found the hard way this session)

### Windows: `bun` installs correctly but isn't found in an already-open terminal

The official installer (`irm bun.sh/install.ps1 | iex` in PowerShell) installs to `~/.bun/bin` and *does* correctly add that directory to the Windows user `PATH` registry key. The catch: any terminal session that was already open before the install ran won't see the updated `PATH` — and critically, **a new tab within the same Windows Terminal/VS Code window often isn't enough**, because tabs frequently share the parent process's already-loaded environment rather than re-reading it. You need to fully close and reopen the terminal *application*, not just open a new tab.

Until you've done that, call the binary directly instead of waiting: `"$env:USERPROFILE\.bun\bin\bun.exe" run dev` in PowerShell, or `~/.bun/bin/bun run dev` in bash. As a durable safety net, `~/.bashrc` now has `export PATH="$HOME/.bun/bin:$PATH"` appended, so bash sessions in particular should pick it up on their next fresh start even if the Windows-level PATH update is somehow still stale.

### `vite preview` doesn't work with this project — see `docs/DEPLOYMENT.md`

Not a config bug, not fixable by changing the nitro preset. Use `bun run start` to actually run a production build locally.

### CRLF lint noise on files you didn't otherwise touch

Several files in this repo (mostly the Supabase integration files and some of the original route files) were apparently never run through Prettier before this session, and Git on Windows converts their line endings to CRLF on checkout (`autocrlf`). If you touch one of these files and ESLint reports a wall of `Delete ␍` errors, that's Prettier objecting to the line endings, not a real regression you introduced — run `bunx prettier --write <file>` on just that file and move on. Don't reformat files you haven't otherwise touched just to silence this; it bloats unrelated diffs.

### A stale lockfile can pin packages to a private registry mirror

Early in this session, `bun.lock` had several packages (mostly `@dnd-kit/*` and `@supabase/*`) resolved against `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/...` — a private GCP Artifact Registry mirror that Lovable's sandbox environment used, baked into the lockfile from when the project was originally set up inside that sandbox. A plain `bun install` doesn't re-resolve packages that already satisfy an existing lockfile entry, so it silently kept fetching from that private mirror even after the project was fully disconnected from Lovable. Fix: delete `bun.lock` and `node_modules`, then `bun install` fresh — this forces every package to re-resolve against the actual configured registry (confirmed via `npm config get registry` → `https://registry.npmjs.org/`, with no bun- or npm-level override present anywhere on the machine).

### A real CSS bug: `@import` ordering

Adding a Google Fonts `@import url(...)` to `src/styles.css` *after* `@import "tailwindcss"` broke every build with `[lightningcss] @import rules must precede all rules aside from @charset and @layer statements`. CSS requires all `@import` statements to come before any other rule. Fix was just reordering — the font import now comes first in the file, before `@import "tailwindcss"`.

### Background dev/preview servers can outlive their intended lifetime on Windows

Stopping a background bash task (via the harness's task-stop mechanism) doesn't always kill the full underlying process tree on Windows — `vite dev`'s child `node` processes, and any Chrome instances a browser-automation tool spawned, can keep running and holding ports/resources. If a later command behaves strangely (port already in use, unexpected slowness, a browser automation tool losing its connection), check `tasklist` for stray `node.exe`/`chrome.exe` processes before assuming the code itself is broken.

**A specific, confusing symptom of this**: a stale server keeps serving whatever `.env` snapshot it started with — if `.env` changes after the stale process started (e.g., switching Supabase projects, adding a new key), requests can silently succeed against a *different* backend or with *missing* credentials than what's currently in the file, with no obvious error pointing at "wrong process." This actually happened while setting up the reminder cron locally: a leftover dev server from before a Supabase project switch kept answering on `:8080` and returned `"No settings row"` even though the settings row demonstrably existed (confirmed via a direct `curl` with the same credentials) — because the stale process was still talking to the old project. `taskkill //F //IM node.exe` (Windows) + a fresh `bun run dev` resolved it immediately. If a locally-running route behaves inexplicably after an `.env` change, kill everything and restart before debugging the code.
