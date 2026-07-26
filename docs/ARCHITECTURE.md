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
| `/settings`                 | Reminder recipient email, sender address, on/off toggle — reads/writes the single-row `settings` table                                                                                                                                                           |
| `/api/public/run-reminders` | Server-only route (see "Reminder pipeline" below)                                                                                                                                                                                                                |

All four data-bearing views (`/`, `/board`, `/calendar`, `/list`) share one TanStack Query key, `["events"]`, fetched via `listEvents()`. There is no `/event/$id` detail route — creating and editing both happen through the same `EventDrawer` component, opened via local `editing`/`open` state on whichever page triggered it. If you're tempted to add a detail page, know that you'd be introducing a second navigation pattern alongside the drawer, not replacing it — every existing page already assumes drawer-based editing.

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

Three different ways the app talks to Postgres, each with a different trust boundary:

- **`src/integrations/supabase/client.ts`** — the browser/SSR client, using the anon/publishable key. RLS-enforced. This is what `src/lib/events-api.ts` uses for every normal read/write, and it's the _only_ client that should ever be imported from a route component.
- **`src/integrations/supabase/client.server.ts`** — the service-role client (`supabaseAdmin`). **Bypasses RLS entirely.** Only ever import this inside another `*.server.ts` module, or dynamically inside a server route handler (exactly the pattern `src/routes/api/public/run-reminders.ts` uses: `const { supabaseAdmin } = await import("@/integrations/supabase/client.server")`). A top-level static import of this module from a route _component_ file or a `*.functions.ts` file ships the service-role key path into the client bundle — the `importProtection` config above is specifically there to catch exactly this mistake, but don't rely on it as your only safeguard; the discipline is to always dynamic-import this one.
- **`src/integrations/supabase/auth-middleware.ts`** (`requireSupabaseAuth`) — server-side TanStack Start middleware that validates an incoming `Authorization: Bearer <jwt>` header and injects `{ supabase, userId, claims }` into the request context. Paired with `src/integrations/supabase/auth-attacher.ts` (`attachSupabaseAuth`), a client-side middleware registered globally in `src/start.ts` that reads the current session and attaches the bearer token to every outgoing serverFn call automatically.

Since this app has no login screen — it's single-user with fully open RLS policies (`USING (true)` on every table; see `docs/DATABASE.md`) — `requireSupabaseAuth` is currently dead code from the app's own routes' perspective. It exists as scaffolding for if/when real multi-user auth gets added; don't delete it as "unused," and don't be surprised that nothing calls it yet.

## Domain layer

`src/lib/domain.ts` is the single source of truth for the four Postgres enums (`EventType`, `EventMode`, `EventStatus`, `EventPriority`) on the TypeScript side — labels, short labels, and Tailwind color-class mappings (`STATUS_COLORS`, `TYPE_COLORS`) all live here, all derived from the generated `Database` type in `types.ts`. Changing a status or type requires three things to move together: a new migration altering the Postgres enum, an update to the corresponding array/map in `domain.ts`, and regenerating `types.ts` — skip any one and the app either won't compile or will silently mis-render a status it doesn't recognize.

`src/lib/events-api.ts` is the _only_ data-access layer — `listEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`, `setStatus`, `getSettings`, `updateSettings`. Every route and component goes through these; nothing outside this file calls `supabase.from(...)` directly except the reminder route (which uses `supabaseAdmin`, a different client, for a good reason — see above).

## Reminder pipeline

End to end: `src/lib/reminders.ts` holds the pure logic (`reminderWindow(now)` — the 23h/25h lookahead calc, parameterized on `now` so it's testable without mocking the clock; `renderReminderEmail()` — the HTML template; `labelType()`/`escapeHtml()` — small helpers). `src/routes/api/public/run-reminders.ts` is the actual server route: it checks a `REMINDER_CRON_SECRET` shared-secret header (`x-reminder-cron-secret`, compared with `node:crypto`'s `timingSafeEqual`, fails closed with a 500 if the env var itself isn't configured, 401 on a missing/wrong header) before doing anything else — so despite living under `api/public/`, it is **not** actually public. Once authorized, it reads the single-row `settings` table via `supabaseAdmin`, finds events with `reminder_sent = false` inside the reminder window, sends one email per match via the Resend HTTP API directly (`fetch("https://api.resend.com/emails", ...)`, no SDK), then flips `reminder_sent`/`reminder_sent_at`. Full production setup (the pg_cron job, the secret, the placeholder URL) is in `docs/DEPLOYMENT.md` — this file is about what the code does, that one's about what you need to _do_ to make it actually fire.

## SSR error handling — two layers, two different failure modes

Don't "simplify" this without understanding that each layer catches something the other one can't:

- **`src/start.ts`**'s `errorMiddleware` wraps every server function. It catches a thrown non-HTTP error inside a serverFn and returns a rendered error page instead of letting the raw exception reach the client.
- **`src/server.ts`** wraps the entire Nitro/h3 fetch handler — one level further out. It additionally detects the specific case where **h3 itself** swallows an in-handler throw into a generic `{"unhandled":true,"message":"HTTPError"}` JSON 500 response. A `try`/`catch` around the handler call doesn't see these (h3 catches them internally first), so `src/server.ts` instead inspects the _response body_ for that exact shape, and if it matches, substitutes the real underlying error — recovered via `src/lib/error-capture.ts`'s out-of-band `window.onerror`/`unhandledrejection` capture, which stashes the last real error for up to 5 seconds specifically so this second layer can retrieve it.

Both render the same `src/lib/error-page.ts` fallback HTML, so the two layers are invisible to a user — they only matter if you're debugging why an error isn't showing a stack trace where you'd expect one.
