# Placement Tracker

<<<<<<< HEAD
A personal, single-user tracker for campus placement season — every PPT, online test, and interview round in one place, on a board, a calendar, and a list, with an email reminder 24 hours before anything you have to show up to.
=======

A multi-user tracker for campus placement events (PPTs, online/offline tests, and interview rounds), with 24-hour-before email reminders.

## Accounts

Signup is open — anyone can create an account with an email address and password, or sign in with Google. Every event, and each user's reminder settings, belong to the account that created them: users only ever see and edit their own data (enforced in the database by per-user row-level security, not just in the UI). Each account gets its own reminder recipient address, so reminders fan out per owner.

> > > > > > > 8d3b0d3 (docs: correct single-user claims and record deferred audit follow-ups)

Built because placement season is a scheduling problem disguised as a career problem: a dozen companies, each with its own multi-round pipeline, all moving at once, and the cost of missing one slot is the whole pipeline.

```
Upcoming → PPT Done → OT Scheduled → OT Cleared → Interview R1 → Interview R2 → HR → Offer
                                                                                    ↘ Rejected
                                                                                    ↘ Ghosted
```

**Stack** — TanStack Start (file-based routing + SSR) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · TanStack Query · Supabase (Postgres) · Resend · dnd-kit · Recharts

> [!IMPORTANT]
> The deployed instance currently can't read or write: the `anon` role lost its table grants on the live Supabase project, so every query fails with `42501`. Pages still render — they just have no data. Diagnosis and the fix decision are in [`docs/STATUS.md`](docs/STATUS.md).

---

## Quick start

<<<<<<< HEAD
Package manager is [bun](https://bun.sh), exclusively — `bun.lock` and `bunfig.toml` are both committed, and neither `package-lock.json` nor `yarn.lock` should ever appear beside them.
=======

1. **Kanban** (`/board`) — drag between statuses, filter by company/role/round.
2. **Calendar** (`/calendar`) — month view, color-coded by type, click to open.
3. **Dashboard** (`/`) — counts by status, conversion funnel, events this week, upcoming next 7 days.
4. **List / Table** (`/list`) — sortable, searchable, quick edit.
5. **Settings** (`/settings`) — reminder recipient email, sender address, on/off toggle (per account).

Plus **Sign in** (`/login`) — email/password or Google. All five views above require an account.

## Reminders (24h before each event)

- **Trigger**: a `pg_cron` job hits the `/api/public/run-reminders` route every 15 minutes; the route finds events starting in ~24h with `reminder_sent = false`, sends an email via Resend to each event owner's own recipient address, and flips the flag.
- **Auth**: the route requires a shared-secret header (`x-reminder-cron-secret`, checked against `REMINDER_CRON_SECRET`) — see `supabase/migrations/` for how the cron job is wired up.
- **Idempotent**: one reminder per event, guarded by `reminder_sent`.

## Stack

TanStack Start (file-based router + SSR) + TypeScript + React 19 + Tailwind v4 + shadcn/ui + TanStack Query + Supabase (Postgres) + Resend (email) + dnd-kit (kanban) + Recharts (dashboard).

## Development

Package manager is [bun](https://bun.sh).

> > > > > > > 8d3b0d3 (docs: correct single-user claims and record deferred audit follow-ups)

```sh
bun install
cp .env.example .env    # then fill it in — see below
bun run dev             # http://localhost:8080
```

Without a populated `.env` the app throws `Missing Supabase environment variable(s)` on first render rather than failing quietly, so you'll know immediately.

### Environment

Every variable is documented inline in [`.env.example`](.env.example). The one thing worth repeating here, because getting it wrong is unrecoverable:

> `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It must **never** carry a `VITE_` prefix — that would inline it into the browser bundle and hand every visitor full database access. Only `client.server.ts` reads it, and only via dynamic import from server route handlers.

The Supabase URL and publishable key are deliberately set twice, `VITE_`-prefixed and not. Vite only inlines the prefixed spelling into the client bundle; the SSR path reads the unprefixed one from the process environment. Both halves need the same values.

### Database

The schema lives in [`supabase/migrations/`](supabase/migrations/) and has to be applied by hand in the Supabase SQL editor — there's no CLI path wired up. Full walkthrough in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), schema reference in [`docs/DATABASE.md`](docs/DATABASE.md).

---

## The event model

One entry is one **event**, not one company — so a single company's PPT, online test, and three interview rounds are five rows that move through the pipeline independently. That's the central modelling decision and everything else follows from it.

| Field               | Notes                                           |
| ------------------- | ----------------------------------------------- |
| **Company**         | required                                        |
| **Type**            | PPT · OT (Online) · OT (Offline/DC) · Interview |
| **Round**           | free text — `Tech R1`, `HR`. Interview only     |
| **Role / Profile**  | e.g. `SDE Intern`                               |
| **Start / End**     | start required, end optional                    |
| **Mode**            | Online · Offline · Hybrid                       |
| **Location / Link** | venue, meet URL, or data-centre name            |
| **Status**          | the pipeline stage above                        |
| **Priority**        | Low · Medium · High                             |
| **Contacts**        | repeatable POC name / email / phone             |
| **CTC / Stipend**   | optional                                        |
| **Resume version**  | which tailored resume you sent                  |
| **Prep notes**      | markdown, pre-event                             |
| **Outcome notes**   | post-event                                      |
| **Reminder sent**   | internal flag, set by the cron job              |

Unfamiliar with PPT / OT / DC? [`docs/GLOSSARY.md`](docs/GLOSSARY.md).

## The five views

| Route       | What it's for                                                           |
| ----------- | ----------------------------------------------------------------------- |
| `/`         | Dashboard — counts by status, conversion funnel, this week, next 7 days |
| `/board`    | Kanban — drag between stages to change status                           |
| `/calendar` | Month grid, colour-coded by type                                        |
| `/list`     | Sortable, searchable table for bulk scanning                            |
| `/settings` | Reminder recipient, sender address, on/off                              |

All five share a single TanStack Query key (`["events"]`) and one shared `EventDrawer` for create and edit. There is deliberately no `/event/$id` detail route — the drawer is the detail view.

## Reminders

A `pg_cron` job hits `/api/public/run-reminders` every 15 minutes. The route selects events starting 23–25 hours out with `reminder_sent = false`, emails each one via Resend, and flips the flag.

The window is two hours wide on purpose: the job runs every 15 minutes, and `reminder_sent` is what actually prevents duplicates, so the window only has to be wider than the polling interval. Narrowing it to a precise 24-hour boundary would risk missing events between ticks.

Despite living under `api/public/`, the route is **not** public — it requires an `x-reminder-cron-secret` header compared against `REMINDER_CRON_SECRET` with `timingSafeEqual`. A missing secret and a wrong secret return an identical opaque `401`, so an anonymous caller can't probe whether the endpoint is configured.

Setup runbook: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Commands

```sh
bun run dev            # vite dev — http://localhost:8080
bun run build          # production build
bun run start          # run the production build (node .output/server/index.mjs)
bun run lint           # eslint .
bun run format         # prettier --write .
bun run test           # vitest run
bun run test:watch     # vitest, watch mode
bun run test:coverage  # vitest run --coverage
bun run test:e2e       # playwright test (starts its own dev server on :8080)
```

`bun run preview` is **broken** and cannot be fixed by changing the nitro preset — the incompatibility is between using nitro at all and what `vite preview`'s bundled TanStack Start plugin expects. Use `bun run start`, which runs a real production build. Background in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Single test file or case:

```sh
bunx vitest run src/lib/domain.test.ts -t "returns the label"
bunx playwright test e2e/board.spec.ts
```

## Testing

Coverage is scoped on purpose to three files — `domain.ts`, `reminders.ts`, `events-api.ts` — at an 80% threshold, rather than the whole tree. Those three are the pure-logic and data-access core, where a bug is silent and expensive: a wrong enum label, a wrong reminder window, a swallowed Supabase error. The React components are better served by the E2E specs asserting real user flows than by unit tests asserting on JSX. If you add pure logic to `src/lib`, add it to `coverage.include` deliberately — it is not picked up by default.

E2E runs against the **real** Supabase project; there's no separate test database. Specs tag anything they create with `company: "__e2e_test__"` and clean up in `afterEach`, including after a mid-test failure. Follow that convention for any new spec that writes data.

Rationale and the full list of environment gotchas: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## Documentation

| Doc                                       | Contents                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Routing, `vite.config.ts` plugin by plugin, the Supabase client split, the reminder pipeline, SSR error handling |
| [`DATABASE.md`](docs/DATABASE.md)         | Schema, enums, RLS, grants, migration history                                                                    |
| [`DEPLOYMENT.md`](docs/DEPLOYMENT.md)     | Deploy target, production env vars, the cron runbook, current deploy status                                      |
| [`DEVELOPMENT.md`](docs/DEVELOPMENT.md)   | Testing philosophy and every environment gotcha found the hard way                                               |
| [`DESIGN.md`](docs/DESIGN.md)             | The "dossier" visual system — colours, type, the EventCard, what was rejected and why                            |
| [`DECISIONS.md`](docs/DECISIONS.md)       | Dated log of non-obvious calls, so they don't get re-litigated                                                   |
| [`GLOSSARY.md`](docs/GLOSSARY.md)         | PPT, OT, DC, HR round, and the pipeline stages explained                                                         |
| [`STATUS.md`](docs/STATUS.md)             | Living punch list — **start here** to find out what's currently broken                                           |

Repository conventions and architecture pointers for AI agents: [`CLAUDE.md`](CLAUDE.md).
