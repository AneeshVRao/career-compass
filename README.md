# Placement Tracker

A personal, single-user tracker for campus placement events (PPTs, online/offline tests, and interview rounds), with 24-hour-before email reminders.

## Event model (event-centric)

Each entry = one event. Fields:

- **Company** (text)
- **Type**: PPT · OT (Online) · OT (Offline/Data-Center) · Interview
- **Round** (text, e.g. "Tech R1", "HR") — only for Interview
- **Role / Profile** (text)
- **Start date & time**, **End time** (optional)
- **Mode**: Online · Offline · Hybrid
- **Location / Link** (venue, meet link, or DC name)
- **Status** (see pipeline below)
- **Priority** (Low / Med / High)
- **Contacts** (POC name, email, phone — repeatable)
- **CTC / Stipend** (optional)
- **Resume version** (text tag)
- **Prep notes / Description** (markdown)
- **Outcome notes** (post-event)
- **Reminder sent?** (auto, internal)

## Pipeline (kanban columns)

`Upcoming → PPT Done → OT Scheduled → OT Cleared → Interview R1 → Interview R2 → HR → Offer → Rejected → Ghosted`

## Views

1. **Kanban** (`/board`) — drag between statuses, filter by company/role/round.
2. **Calendar** (`/calendar`) — month view, color-coded by type, click to open.
3. **Dashboard** (`/`) — counts by status, conversion funnel, events this week, upcoming next 7 days.
4. **List / Table** (`/list`) — sortable, searchable, quick edit.
5. **Settings** (`/settings`) — reminder recipient email, sender address, on/off toggle.

## Reminders (24h before each event)

- **Trigger**: a `pg_cron` job hits the `/api/public/run-reminders` route every 15 minutes; the route finds events starting in ~24h with `reminder_sent = false`, sends an email via Resend, and flips the flag.
- **Auth**: the route requires a shared-secret header (`x-reminder-cron-secret`, checked against `REMINDER_CRON_SECRET`) — see `supabase/migrations/` for how the cron job is wired up.
- **Idempotent**: one reminder per event, guarded by `reminder_sent`.

## Stack

TanStack Start (file-based router + SSR) + TypeScript + React 19 + Tailwind v4 + shadcn/ui + TanStack Query + Supabase (Postgres) + Resend (email) + dnd-kit (kanban) + Recharts (dashboard).

## Development

Package manager is [bun](https://bun.sh).

```sh
bun install
bun run dev            # starts the dev server on http://localhost:8080
bun run build           # production build
bun run lint            # eslint .
bun run format          # prettier --write .
bun run test            # vitest run
bun run test:coverage   # vitest run --coverage
bun run test:e2e        # playwright test
```

See `CLAUDE.md` for architecture notes and repository conventions.
