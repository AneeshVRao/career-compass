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

**E2E tests run against the real single-user Supabase project.** There is no separate test database — standing one up wasn't worth the overhead for a personal single-user tool. `e2e/board.spec.ts` tags any data it creates with `company: "__e2e_test__"` and deletes it in `afterEach` (which runs the same cleanup even if the test itself failed partway through, so a crash mid-test doesn't leave orphaned rows). Follow the same tag-and-clean convention for any new E2E test that writes data — and if you're ever debugging a test that seems to intermittently fail on an assertion about _count_, check for leftover `__e2e_test__` rows from a previous failed run first (query `events?company=eq.__e2e_test__` via the REST API, or check the `/list` page) before assuming the app itself is broken.

Playwright's `webServer` config in `playwright.config.ts` starts `bun run dev` itself and expects port `8080` — don't hardcode a different port without actually checking what `bun run dev` prints, since Vite's dev server port isn't guaranteed across environments.

## Known gotchas (found the hard way this session)

### Windows: `bun` installs correctly but isn't found in an already-open terminal

The official installer (`irm bun.sh/install.ps1 | iex` in PowerShell) installs to `~/.bun/bin` and _does_ correctly add that directory to the Windows user `PATH` registry key. The catch: any terminal session that was already open before the install ran won't see the updated `PATH` — and critically, **a new tab within the same Windows Terminal/VS Code window often isn't enough**, because tabs frequently share the parent process's already-loaded environment rather than re-reading it. You need to fully close and reopen the terminal _application_, not just open a new tab.

Until you've done that, call the binary directly instead of waiting: `"$env:USERPROFILE\.bun\bin\bun.exe" run dev` in PowerShell, or `~/.bun/bin/bun run dev` in bash. As a durable safety net, `~/.bashrc` now has `export PATH="$HOME/.bun/bin:$PATH"` appended, so bash sessions in particular should pick it up on their next fresh start even if the Windows-level PATH update is somehow still stale.

### `vite preview` doesn't work with this project — see `docs/DEPLOYMENT.md`

Not a config bug, not fixable by changing the nitro preset. Use `bun run start` to actually run a production build locally.

### CRLF lint noise — fixed at the root, don't re-fix it per-file

**Resolved 2026-07-26 by `.gitattributes` (`* text=auto eol=lf`). Left here because the symptom is confusing enough to re-diagnose from scratch if it ever comes back.**

Git on Windows defaults to `core.autocrlf=true`, which rewrites files to CRLF _on checkout_. Prettier defaults to `endOfLine: "lf"`. Those two facts together mean every line of every file Git had just touched became a `Delete ␍` error — and it isn't limited to files you edited. Rebasing the multi-user-auth branch re-checked-out the whole tree and produced **2,862 lint errors across files nobody had modified**, which is more than enough to bury the handful of real ones.

The old advice here was "run `bunx prettier --write <file>` on just that file and move on." That's a band-aid: it fixes the working tree until the next checkout, rebase, or branch switch puts the CRLFs straight back. Note the index was _never_ wrong — `autocrlf` normalizes to LF on commit, so this was always a working-tree-only illusion.

`* text=auto eol=lf` pins the working tree to LF regardless of the individual developer's `autocrlf` setting, so the problem doesn't recur. If you ever see a wall of `Delete ␍` again, check that `.gitattributes` still exists before reformatting anything.

### Nested checkouts get picked up by the toolchain — check your ignore globs are recursive

An agent worktree under `.claude/worktrees/` held a complete 357 MB checkout of this repo, including its own `node_modules` and its own `.env`. Nothing excluded it, so:

- `bun run lint` reported **6,285 problems**, 6,272 of them inside the worktree.
- `bun run test` collected **663 test files**, ran for **370 seconds**, and reported 20 failures — all of them vendored `zod`/`tanstack` tests that happened to ship inside that nested `node_modules`.

Neither number reflected anything about this codebase, and both are big enough to make the real signal invisible.

The vitest root cause is worth internalizing because the glob looks correct at a glance: `exclude: ["node_modules/**"]` **overrides** vitest's built-in defaults, and a leading-segment pattern only masks the _root_ `node_modules`. Every nested copy stays in scope. The fix is `**/node_modules/**`, which is what the config uses now — deliberately chosen over adding `.claude` as a special case, so any future nested checkout is covered too. `.claude` is _also_ listed, but as belt-and-braces, not as the actual fix.

`.claude/worktrees/` is gitignored (it carries its own `.env`, so a stray `git add .` would have committed real secrets), and `.claude` is in both the ESLint ignore list and `.prettierignore`.

If lint or test output ever looks absurd, check _where_ the files it's complaining about actually live before debugging them.

### A stale lockfile can pin packages to a private registry mirror

Early in this session, `bun.lock` had several packages (mostly `@dnd-kit/*` and `@supabase/*`) resolved against `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/...` — a private GCP Artifact Registry mirror that Lovable's sandbox environment used, baked into the lockfile from when the project was originally set up inside that sandbox. A plain `bun install` doesn't re-resolve packages that already satisfy an existing lockfile entry, so it silently kept fetching from that private mirror even after the project was fully disconnected from Lovable. Fix: delete `bun.lock` and `node_modules`, then `bun install` fresh — this forces every package to re-resolve against the actual configured registry (confirmed via `npm config get registry` → `https://registry.npmjs.org/`, with no bun- or npm-level override present anywhere on the machine).

### A real CSS bug: `@import` ordering

Adding a Google Fonts `@import url(...)` to `src/styles.css` _after_ `@import "tailwindcss"` broke every build with `[lightningcss] @import rules must precede all rules aside from @charset and @layer statements`. CSS requires all `@import` statements to come before any other rule. Fix was just reordering — the font import now comes first in the file, before `@import "tailwindcss"`.

### Background dev/preview servers can outlive their intended lifetime on Windows

Stopping a background bash task (via the harness's task-stop mechanism) doesn't always kill the full underlying process tree on Windows — `vite dev`'s child `node` processes, and any Chrome instances a browser-automation tool spawned, can keep running and holding ports/resources. If a later command behaves strangely (port already in use, unexpected slowness, a browser automation tool losing its connection), check `tasklist` for stray `node.exe`/`chrome.exe` processes before assuming the code itself is broken.

**A specific, confusing symptom of this**: a stale server keeps serving whatever `.env` snapshot it started with — if `.env` changes after the stale process started (e.g., switching Supabase projects, adding a new key), requests can silently succeed against a _different_ backend or with _missing_ credentials than what's currently in the file, with no obvious error pointing at "wrong process." This actually happened while setting up the reminder cron locally: a leftover dev server from before a Supabase project switch kept answering on `:8080` and returned `"No settings row"` even though the settings row demonstrably existed (confirmed via a direct `curl` with the same credentials) — because the stale process was still talking to the old project. `taskkill //F //IM node.exe` (Windows) + a fresh `bun run dev` resolved it immediately. If a locally-running route behaves inexplicably after an `.env` change, kill everything and restart before debugging the code.
