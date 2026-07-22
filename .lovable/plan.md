
# Placement Tracker — PPT / OT / Interview

A personal, single-user tracker for campus placement events. No login screen — data lives in your own Lovable Cloud backend so it syncs across devices and powers the reminder cron.

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

Default order — easy to reorder later:

`Upcoming → PPT Done → OT Scheduled → OT Cleared → Interview R1 → Interview R2 → HR → Offer → Rejected → Ghosted`

## Views

1. **Kanban** — drag between statuses, filter by company/type, search.
2. **Calendar** — month + week view, color-coded by type, click to open.
3. **Dashboard** — counts by status, conversion funnel (Applied→OT→Interview→Offer), events this week, upcoming next 7 days, per-company timeline.
4. **List / Table** — sortable by date, quick edit.

## Reminders (24h before each event)

- **Recipient**: `aneeshvrao2017@gmail.com` (hardcoded, editable in Settings).
- **Sender**: Resend (via the existing Resend connector).
- **Trigger**: pg_cron in Lovable Cloud runs every 15 min → hits a public API route → route finds events starting in ~24h with `reminder_sent = false`, sends email via Resend, flips the flag.
- **Email body**: company, type, round, date/time, mode, location/link, prep notes, direct link to the entry.
- **Idempotent**: one reminder per event, guarded by `reminder_sent` + unique key.

## Technical section

- **Stack**: TanStack Start + Tailwind + shadcn/ui, dnd-kit for kanban, `react-day-picker` + FullCalendar-lite for calendar, Recharts for dashboard.
- **Backend**: Lovable Cloud (Supabase). One table `events` (all fields above) + `settings` (recipient email, digest opt-in later). RLS: open to a single hardcoded owner UUID stored in secret, or fully public since single-user — I'll use a single anonymous owner row keyed by a project-owner UUID so no login is needed but data is protected via a service-role-only API path.
- **Resend**: use the linked `@connector:resend` — server route calls the Resend gateway with `LOVABLE_API_KEY` + `RESEND_API_KEY`. From address = `onboarding@resend.dev` initially (delivers to your own address since it's the account owner). If you later add a domain, we switch it.
- **Cron**: `pg_cron` job every 15 min → `net.http_post` to `/api/public/run-reminders` on the stable project URL, protected by an HMAC header secret (`REMINDER_CRON_SECRET`, auto-generated).
- **Routes**:
  - `/` — Dashboard
  - `/board` — Kanban
  - `/calendar` — Calendar
  - `/list` — Table
  - `/event/$id` — Detail / edit drawer
  - `/settings` — Recipient email, reminder toggle
  - `/api/public/run-reminders` — cron endpoint (HMAC-verified)

## Build order

1. Enable Lovable Cloud, create `events` + `settings` tables with RLS and grants.
2. Seed statuses/types as enums, add a few example events.
3. Build shell: sidebar nav, routing, theme.
4. Event create/edit drawer with all fields.
5. Kanban board (dnd-kit) with drag-to-change-status.
6. Calendar view.
7. Dashboard with stats + funnel.
8. Settings page.
9. Reminder API route + HMAC secret + Resend email template.
10. pg_cron migration scheduling every 15 min.
11. Test end-to-end by creating an event 24h out and forcing the cron.

## Open items I'm assuming (say the word to change)

- Statuses above (you didn't specify — happy to swap).
- Single-user, no auth screen; data effectively public within your project — fine for personal use.
- Reminder email from `onboarding@resend.dev` until you add a verified domain.
- No SMS / push, email only.
