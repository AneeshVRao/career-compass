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

Two **route handlers** are unit-tested directly, in files named with a leading `-` (`src/routes/auth/-callback.test.ts`, `src/routes/api/public/-run-reminders.test.ts`). The dash matters: it is the TanStack router plugin's `routeFileIgnorePrefix`, so the generator skips these files instead of trying to turn them into routes — that is what lets a test live next to the route it covers inside `src/routes/`. Both reach the real handler via `Route.options.server.handlers`, so what is exercised is the actual wired export rather than a copy of its logic. `-run-reminders.test.ts` mocks `@/integrations/supabase/client.server` with the same chainable/thenable builder idea as `events-api.test.ts` and stubs `fetch` for Resend, which is what makes the per-user reminder fan-out assertable (`planReminderSends()` only _plans_ the sends; that test covers the part that actually addresses and marks them).

`e2e/helpers.ts` holds what the auth-dependent specs share: `.env` reading, disposable-account create/delete via the Supabase admin API, `signIn()`, and `createEvent()`. Accounts are created through the **admin API with `email_confirm: true`** rather than the signup form wherever a spec needs a guaranteed session — that keeps those tests independent of whether "Confirm email" is switched on for the project, while still firing the `handle_new_user()` trigger.

`e2e/multi-user-isolation.spec.ts` is the cross-user isolation check: two real accounts, two separate browser contexts (separate cookie jars — reusing one context would only prove the UI re-renders after a sign-out), each creating one event, then asserting each account's `/board` and `/list` contain their own event and that the other's company string appears nowhere in `page.content()`. Asserting against the full served markup rather than a visibility check is deliberate: a leak into the SSR payload is still a leak even if nothing renders it.

`e2e/auth.spec.ts` covers the auth flows: unauthenticated redirects for all five protected paths, and a signup → signed-in → sign-out round trip. Two things about it worth knowing. It creates a **disposable account** (`__e2e_test__+<timestamp>@example.com`) and deletes it in `afterEach` via the Supabase admin API — the same tag-and-clean spirit as `board.spec.ts`, extended to auth users, and deleting the user cascades its `settings`/`events` rows away. And it deliberately accepts **either** outcome of sign-up (an immediate session, or a "check your email" notice) rather than pinning the assertion to whether "Confirm email" happens to be enabled on the project; the sign-out half of the test only runs in the immediate-session case. It also asserts that `/settings` shows the new account's own address in "Recipient email", which is how the `handle_new_user()` trigger is verified — nothing in the app code creates a settings row, so a pre-populated value can only have come from the trigger. Because that assertion sits in the immediate-session branch, `e2e/auth.spec.ts` additionally carries a "new-user provisioning" test that uses an admin-created confirmed account, so the trigger is covered whatever the "Confirm email" setting is. Playwright doesn't load `.env` (it never goes through Vite), so `e2e/helpers.ts` reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` out of `.env` by hand rather than pulling in a dotenv dependency for one helper.

**E2E tests run against the real Supabase project.** There is no separate test database — standing one up still hasn't been worth the overhead at this size. This is why the disposable-account convention matters more now that the app is multi-user: specs create real accounts in the real project, so every one of them must delete what it created. `e2e/board.spec.ts` tags any data it creates with `company: "__e2e_test__"` and deletes it in `afterEach` (which runs the same cleanup even if the test itself failed partway through, so a crash mid-test doesn't leave orphaned rows). Follow the same tag-and-clean convention for any new E2E test that writes data — and if you're ever debugging a test that seems to intermittently fail on an assertion about _count_, check for leftover `__e2e_test__` rows from a previous failed run first (query `events?company=eq.__e2e_test__` via the REST API, or check the `/list` page) before assuming the app itself is broken.

Playwright's `webServer` config in `playwright.config.ts` starts `bun run dev` itself and expects port `8080` — don't hardcode a different port without actually checking what `bun run dev` prints, since Vite's dev server port isn't guaranteed across environments.

## Known gotchas (found the hard way this session)

### Windows: `bun` installs correctly but isn't found in an already-open terminal

The official installer (`irm bun.sh/install.ps1 | iex` in PowerShell) installs to `~/.bun/bin` and _does_ correctly add that directory to the Windows user `PATH` registry key. The catch: any terminal session that was already open before the install ran won't see the updated `PATH` — and critically, **a new tab within the same Windows Terminal/VS Code window often isn't enough**, because tabs frequently share the parent process's already-loaded environment rather than re-reading it. You need to fully close and reopen the terminal _application_, not just open a new tab.

Until you've done that, call the binary directly instead of waiting: `"$env:USERPROFILE\.bun\bin\bun.exe" run dev` in PowerShell, or `~/.bun/bin/bun run dev` in bash. As a durable safety net, `~/.bashrc` now has `export PATH="$HOME/.bun/bin:$PATH"` appended, so bash sessions in particular should pick it up on their next fresh start even if the Windows-level PATH update is somehow still stale.

### `vite preview` doesn't work with this project — see `docs/DEPLOYMENT.md`

Not a config bug, not fixable by changing the nitro preset. Use `bun run start` to actually run a production build locally.

### CRLF lint noise on files you didn't otherwise touch

Several files in this repo (mostly the Supabase integration files and some of the original route files) were apparently never run through Prettier before this session, and Git on Windows converts their line endings to CRLF on checkout (`autocrlf`). If you touch one of these files and ESLint reports a wall of `Delete ␍` errors, that's Prettier objecting to the line endings, not a real regression you introduced — run `bunx prettier --write <file>` on just that file and move on. Don't reformat files you haven't otherwise touched just to silence this; it bloats unrelated diffs.

### A stale lockfile can pin packages to a private registry mirror

Early in this session, `bun.lock` had several packages (mostly `@dnd-kit/*` and `@supabase/*`) resolved against `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/...` — a private GCP Artifact Registry mirror that Lovable's sandbox environment used, baked into the lockfile from when the project was originally set up inside that sandbox. A plain `bun install` doesn't re-resolve packages that already satisfy an existing lockfile entry, so it silently kept fetching from that private mirror even after the project was fully disconnected from Lovable. Fix: delete `bun.lock` and `node_modules`, then `bun install` fresh — this forces every package to re-resolve against the actual configured registry (confirmed via `npm config get registry` → `https://registry.npmjs.org/`, with no bun- or npm-level override present anywhere on the machine).

### A real CSS bug: `@import` ordering

Adding a Google Fonts `@import url(...)` to `src/styles.css` _after_ `@import "tailwindcss"` broke every build with `[lightningcss] @import rules must precede all rules aside from @charset and @layer statements`. CSS requires all `@import` statements to come before any other rule. Fix was just reordering — the font import now comes first in the file, before `@import "tailwindcss"`.

### Background dev/preview servers can outlive their intended lifetime on Windows

Stopping a background bash task (via the harness's task-stop mechanism) doesn't always kill the full underlying process tree on Windows — `vite dev`'s child `node` processes, and any Chrome instances a browser-automation tool spawned, can keep running and holding ports/resources. If a later command behaves strangely (port already in use, unexpected slowness, a browser automation tool losing its connection), check `tasklist` for stray `node.exe`/`chrome.exe` processes before assuming the code itself is broken.

**A specific, confusing symptom of this**: a stale server keeps serving whatever `.env` snapshot it started with — if `.env` changes after the stale process started (e.g., switching Supabase projects, adding a new key), requests can silently succeed against a _different_ backend or with _missing_ credentials than what's currently in the file, with no obvious error pointing at "wrong process." This actually happened while setting up the reminder cron locally: a leftover dev server from before a Supabase project switch kept answering on `:8080` and returned `"No settings row"` even though the settings row demonstrably existed (confirmed via a direct `curl` with the same credentials) — because the stale process was still talking to the old project. `taskkill //F //IM node.exe` (Windows) + a fresh `bun run dev` resolved it immediately. If a locally-running route behaves inexplicably after an `.env` change, kill everything and restart before debugging the code.
