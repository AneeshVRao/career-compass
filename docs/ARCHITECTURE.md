# Architecture

Deep-dive companion to the short pointers in `CLAUDE.md`. Read this when you need to actually understand _how_ a subsystem works, not just where it lives.

## Stack

TanStack Start (file-based router + SSR) + React 19 + Tailwind v4 + shadcn/ui (Radix primitives) + TanStack Query + Supabase (Postgres) + Resend (transactional email) + dnd-kit (kanban drag-and-drop) + Recharts (dashboard charts). Package manager is bun.

## Routing (`src/routes/`)

File-based routing via `@tanstack/router-plugin` — see `src/routes/README.md` for the naming conventions (`index.tsx` → `/`, `$id.tsx` → dynamic segment, `_layout.tsx` → layout route, etc.). Do **not** create `src/pages/` or any Next.js/Remix-style directory; this project only understands the TanStack Start convention.

`src/routeTree.gen.ts` is regenerated automatically by the router plugin every time `vite dev` or `vite build` runs, by scanning `src/routes/**`. Never hand-edit it — the file header says so, and the plugin will silently overwrite any manual changes on the next dev-server restart. Its internal declaration order can shuffle between regenerations for no functional reason; that's harmless and not worth reverting.

`src/routes/__root.tsx` is the one layout shell every page passes through. It:

- wraps the whole app in `QueryClientProvider` (the `QueryClient` instance itself is created once in `src/router.tsx`'s `getRouter()`)
- defines `<head>` meta tags (title, description, OG tags) and links (the app stylesheet, the favicon, font preconnects)
- defines `notFoundComponent` and `errorComponent` — the latter also calls `router.invalidate()` on retry and logs to `console.error`

Routes, and their jobs:

| Route                       | Job                                                                                                                                                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (`index.tsx`)           | Dashboard — a "Next Up" hero (the single soonest upcoming event + countdown), stat chips, a status bar chart, a stage-funnel, and a 7-day-lookahead card grid                                                                                                    |
| `/board`                    | Kanban — dnd-kit `DndContext` with one droppable `Column` per `EventStatus`, `PointerSensor` with a 5px activation distance (so a plain click doesn't get eaten as a drag), optimistic status updates via TanStack Query's `onMutate`/`onError` rollback pattern |
| `/calendar`                 | Month grid built by hand with `date-fns` (`startOfWeek(startOfMonth(...))` through `endOfWeek(endOfMonth(...))`), events bucketed into a `Map<'yyyy-MM-dd', EventRow[]>`                                                                                         |
| `/list`                     | A sortable/searchable table — the only view that doesn't use `EventCard`                                                                                                                                                                                         |
| `/settings`                 | Reminder recipient email, sender address, on/off toggle — reads/writes the current user's own `settings` row                                                                                                                                                     |
| `/login`                    | Email/password sign-in **and** sign-up, plus a "Sign in with Google" OAuth button. Public                                                                                                                                                                        |
| `/auth/callback`            | Server-only OAuth redirect target — exchanges the `?code` for a cookie session, then 302s into the app. Public                                                                                                                                                   |
| `/api/public/run-reminders` | Server-only route (see "Reminder pipeline" below)                                                                                                                                                                                                                |

All four data-bearing views (`/`, `/board`, `/calendar`, `/list`) share one TanStack Query key, `["events"]`, fetched via `listEvents()`. There is no `/event/$id` detail route — creating and editing both happen through the same `EventDrawer` component, opened via local `editing`/`open` state on whichever page triggered it. If you're tempted to add a detail page, know that you'd be introducing a second navigation pattern alongside the drawer, not replacing it — every existing page already assumes drawer-based editing.

## Auth and route protection

There is exactly **one** route guard, in `src/routes/__root.tsx`'s `beforeLoad`, and it is deliberately an allowlist rather than five per-page guards:

```
const PUBLIC_PATHS = ["/login", "/auth/callback"];
```

`beforeLoad` calls the `fetchAuthUser` server function (`src/lib/auth-server.ts`), which reads the auth cookie server-side and validates it against Supabase Auth. No user + non-public path → `throw redirect({ to: "/login" })`. It returns `{ user }` into router context, so `RootComponent` can seed `AuthProvider` and `/login`'s own `beforeLoad` can bounce an already-signed-in visitor to `/`.

Two properties this shape buys, both worth preserving:

- **A new page is protected by default.** Adding a route protects it automatically; you have to explicitly add it to `PUBLIC_PATHS` to make it public. The five-separate-guards alternative fails in the opposite, dangerous direction — forget one and the page is silently wide open.
- **No auth flicker.** Because the check happens server-side in `beforeLoad` off a cookie (not a localStorage read after hydration), a protected page never renders an unauthenticated first paint that then snaps to a redirect. This is the entire reason the session had to move from localStorage to a cookie.

`src/lib/auth.tsx` (`AuthProvider` / `useAuth`) is the client half: it holds the `User`/`Session`, subscribes to `supabase.auth.onAuthStateChange`, and calls `router.invalidate()` on sign-in/sign-out/token-refresh so the server-side guard re-runs against the new cookie state. It is mounted inside `__root.tsx`'s existing `QueryClientProvider`. `AppShell` consumes it to show the signed-in email and a sign-out control.

Google OAuth flows browser → Supabase → `/auth/callback` (`exchangeCodeForSession`, server-side, so the cookie is set before any app render) → `/`. Setup steps for the Supabase dashboard side are in `docs/DEPLOYMENT.md`.

## `vite.config.ts`

A plain `defineConfig` — no wrapper package. Every plugin is a direct `package.json` dependency, so if something's misbehaving, the fix lives in this one file, not in some composed config you have to trace through `node_modules`. Plugin order matters here (Tailwind and tsconfig-paths need to run before the framework plugins that consume their output):

1. `@tailwindcss/vite`'s `tailwindcss()` — processes `src/styles.css`'s `@import "tailwindcss"`.
2. `vite-tsconfig-paths`'s `tsConfigPaths({ projects: ["./tsconfig.json"] })` — resolves the `@/*` → `src/*` alias from `tsconfig.json` so Vite's bundler agrees with TypeScript's own path resolution, from one source of truth.
3. `@tanstack/react-start/plugin/vite`'s `tanstackStart(...)`, called with two options:
   - `importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } }` — fails the build if a client-reachable module imports anything under a `**/server/**` path or the `server-only` marker package, catching accidental service-role-key leaks into the browser bundle at build time rather than at runtime.
   - `server: { entry: "server" }` — redirects TanStack Start's own server entry point to `src/server.ts` (see "SSR error handling" below) instead of its internal default.
4. `nitro/vite`'s `nitro({ preset: "node-server" })` — **build only** (`command === "build"`), see `docs/DEPLOYMENT.md` for why this preset.
5. `@vitejs/plugin-react`'s `viteReact()`.

Other config in the same file: `resolve.dedupe` forces a single copy of React/ReactDOM/TanStack Query across the dependency graph (prevents the classic "two React copies, hooks break" class of bug); `optimizeDeps.include` pre-bundles React's entry points for faster cold starts; an explicit `define` pass re-exposes every `VITE_`-prefixed env var as `import.meta.env.X` (belt-and-suspenders alongside Vite's own automatic handling — matters under SSR/nitro bundling where the automatic replacement doesn't always reach every bundle); a dev-build-only branch (used by `bun run build:dev`) forces `process.env.NODE_ENV` to `"development"` client-side; the dev server's `watch.awaitWriteFinish` debounce (1000ms stability threshold) avoids double-reloads on slower filesystems.

## Supabase client split — read this before touching any Supabase code

**Three** clients, each a genuinely different trust boundary. All three share one small helper, `src/integrations/supabase/fetch.ts` (`createSupabaseFetch`), which strips the `Authorization: Bearer <raw key>` header that supabase-js sets by default — new-style opaque keys (`sb_publishable_…`/`sb_secret_…`) aren't JWTs and PostgREST rejects them there, so the key travels in `apikey` instead. A real user JWT passes through untouched, which is what lets RLS see the logged-in user.

- **`src/integrations/supabase/client.ts`** — the browser client, anon/publishable key, RLS-enforced. Built with `@supabase/ssr`'s **`createBrowserClient`**, so the session lives in a **cookie** rather than localStorage. This is what `src/lib/events-api.ts` uses for every normal read/write, and it's the only client a route component should import. (It was previously `createClient` with `storage: localStorage`; that could not be read server-side, which is why route guards had to run client-side and flickered.)
- **`src/integrations/supabase/client.request.server.ts`** (`getSupabaseServerClient()`) — **new.** A per-request, cookie-aware, anon-key client built with `@supabase/ssr`'s `createServerClient`, wired to TanStack Start's `getCookies()`/`setCookie()` from `@tanstack/react-start/server`. Queries through it run **as the logged-in user, with RLS applied** — it is the server-side counterpart to `client.ts`, not a replacement for either other client. Used by `fetchAuthUser` (the root route's guard) and `/auth/callback`'s code exchange.
- **`src/integrations/supabase/client.server.ts`** (`supabaseAdmin`) — the service-role client. **Bypasses RLS entirely.** Unchanged by the auth work. Only ever import it inside another `*.server.ts` module, or dynamically inside a server route handler (`const { supabaseAdmin } = await import("@/integrations/supabase/client.server")`, exactly as `run-reminders.ts` does).

**Both server clients must be dynamic-imported from anything client-reachable, for the same reason but via different tripwires.** `client.server.ts` carries the service-role key. `client.request.server.ts` doesn't — but it statically imports `@tanstack/react-start/server`, and the `importProtection` plugin (see `vite.config.ts` above) fails the build on any client-reachable module that imports a `**/server/**` path. This is not hypothetical: the first cut of this feature put `getSupabaseServerClient` in the same module as `fetchAuthUser`, `__root.tsx` imported that module, and the build failed loudly. The fix — and the shape to preserve — is:

- `src/lib/auth-types.ts` — the `AuthUser` type only, zero server imports, safe for anyone to import.
- `src/lib/auth-server.ts` — client-reachable on purpose (the root route imports `fetchAuthUser`), so it holds **no** static server import; it `await import(...)`s the request client _inside_ the handler.
- `src/integrations/supabase/client.request.server.ts` — where the actual cookie/server imports live, only ever reached through a serverFn handler or a route `server.handlers` block.

The old Bearer-token scaffolding — `auth-middleware.ts` (`requireSupabaseAuth`) and `auth-attacher.ts` (`attachSupabaseAuth`, formerly registered as a global `functionMiddleware` in `src/start.ts`) — has been **deleted**. Cookie-based SSR auth supersedes it outright: the session travels in a cookie the server reads directly, so nothing needs to hand-attach a bearer token per serverFn call. `src/start.ts` therefore no longer declares any `functionMiddleware`. If you find yourself reaching for a bearer-token path again, you are rebuilding a second auth mechanism alongside the cookie one — don't.

## Domain layer

`src/lib/domain.ts` is the single source of truth for the four Postgres enums (`EventType`, `EventMode`, `EventStatus`, `EventPriority`) on the TypeScript side — labels, short labels, and Tailwind color-class mappings (`STATUS_COLORS`, `TYPE_COLORS`) all live here, all derived from the generated `Database` type in `types.ts`. Changing a status or type requires three things to move together: a new migration altering the Postgres enum, an update to the corresponding array/map in `domain.ts`, and regenerating `types.ts` — skip any one and the app either won't compile or will silently mis-render a status it doesn't recognize.

`src/lib/events-api.ts` is the _only_ data-access layer — `listEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`, `setStatus`, `getSettings`, `updateSettings`. Every route and component goes through these; nothing outside this file calls `supabase.from(...)` directly except the reminder route (which uses `supabaseAdmin`, a different client, for a good reason — see above).

Note what multi-user auth did **not** change here: the event functions have no per-user logic at all. RLS filters reads, and `events.user_id`'s `auth.uid()` default stamps the owner on insert, so `createEvent` never passes a `user_id`. The one function that did change is `getSettings()`, which dropped its `.limit(1)` — that was a workaround for "there is only ever one settings row globally," which is no longer true. RLS already restricts the query to the caller's own row and a unique index guarantees there is at most one, so `.maybeSingle()` stands alone and will now surface a duplicate-row bug instead of quietly picking a row.

## Reminder pipeline

End to end: `src/lib/reminders.ts` holds the pure logic (`reminderWindow(now)` — the 23h/25h lookahead calc, parameterized on `now` so it's testable without mocking the clock; `renderReminderEmail()` — the HTML template; `labelType()`/`escapeHtml()` — small helpers). `src/routes/api/public/run-reminders.ts` is the actual server route: it checks a `REMINDER_CRON_SECRET` shared-secret header (`x-reminder-cron-secret`, compared with `node:crypto`'s `timingSafeEqual`, fails closed with a 500 if the env var itself isn't configured, 401 on a missing/wrong header) before doing anything else — so despite living under `api/public/`, it is **not** actually public. Once authorized, it fans out **per user**. It reads _all_ `settings` rows and all due events (`reminder_sent = false` inside the reminder window) via `supabaseAdmin` — service-role specifically so the new user-scoped RLS policies don't hide other users' rows from a job that legitimately needs to see everyone's — then calls `planReminderSends(settingsRows, events)` from `reminders.ts` to pair each event with its owner's settings. Each resulting pair is emailed via the Resend HTTP API directly (`fetch("https://api.resend.com/emails", ...)`, no SDK) to **that user's** `reminder_email` from **that user's** `from_email`, then `reminder_sent`/`reminder_sent_at` are flipped.

`planReminderSends` is deliberately pure and exhaustively unit-tested, because it is the piece where a subtle bug means emailing one user's interview schedule to another. Its rules: an event is only sent if it has a non-null `user_id` **and** a matching settings row **and** that row has `reminders_enabled`. Ownerless events (pre-backfill `user_id IS NULL`) and events whose owner opted out are dropped rather than falling back to some other address; an ownerless _settings_ row is likewise never treated as a catch-all recipient. The response body reports `recipients`, `dueEvents`, and `checked` (pairs actually attempted) separately, so a mismatch between due events and attempted sends is visible rather than silent. Full production setup (the pg_cron job, the secret, the placeholder URL) is in `docs/DEPLOYMENT.md` — this file is about what the code does, that one's about what you need to _do_ to make it actually fire.

## SSR error handling — two layers, two different failure modes

Don't "simplify" this without understanding that each layer catches something the other one can't:

- **`src/start.ts`**'s `errorMiddleware` wraps every server function. It catches a thrown non-HTTP error inside a serverFn and returns a rendered error page instead of letting the raw exception reach the client.
- **`src/server.ts`** wraps the entire Nitro/h3 fetch handler — one level further out. It additionally detects the specific case where **h3 itself** swallows an in-handler throw into a generic `{"unhandled":true,"message":"HTTPError"}` JSON 500 response. A `try`/`catch` around the handler call doesn't see these (h3 catches them internally first), so `src/server.ts` instead inspects the _response body_ for that exact shape, and if it matches, substitutes the real underlying error — recovered via `src/lib/error-capture.ts`'s out-of-band `window.onerror`/`unhandledrejection` capture, which stashes the last real error for up to 5 seconds specifically so this second layer can retrieve it.

Both render the same `src/lib/error-page.ts` fallback HTML, so the two layers are invisible to a user — they only matter if you're debugging why an error isn't showing a stack trace where you'd expect one.
