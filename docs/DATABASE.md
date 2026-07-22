# Database

Schema reference for the Supabase/Postgres backend. Source of truth is always `supabase/migrations/`; this file is a readable transcription of it, not a replacement — if the two ever disagree, the migrations are correct and this file is stale.

## Migrations (chronological)

1. **`20260722131142_8274acba-a280-46aa-83b5-f2549fdcb9b8.sql`** — the original schema: creates the four enums, the `events` and `settings` tables, RLS policies, indexes, the `updated_at` trigger, and enables the `pg_cron`/`pg_net` extensions (but does not yet schedule any cron job — see below).
2. **`20260722201059_schedule_reminder_cron.sql`** — adds the actual `cron.schedule(...)` job that invokes the reminder endpoint every 15 minutes. Ships with a `<PROD_APP_URL>` placeholder that must be filled in by hand once a deploy target exists (see `docs/DEPLOYMENT.md`), and expects a `current_setting('app.reminder_cron_secret')` value to already be set via a manual, never-committed `ALTER DATABASE` statement.

## Enums

| Enum | Values |
|---|---|
| `event_type` | `PPT`, `OT_ONLINE`, `OT_OFFLINE`, `INTERVIEW` |
| `event_mode` | `ONLINE`, `OFFLINE`, `HYBRID` |
| `event_status` | `UPCOMING`, `PPT_DONE`, `OT_SCHEDULED`, `OT_CLEARED`, `INTERVIEW_R1`, `INTERVIEW_R2`, `HR`, `OFFER`, `REJECTED`, `GHOSTED` |
| `event_priority` | `LOW`, `MEDIUM`, `HIGH` |

Each of these has a TypeScript mirror in `src/lib/domain.ts` (`EventType`, `EventMode`, `EventStatus`, `EventPriority`) plus a generated mirror in `src/integrations/supabase/types.ts`. **All three must move together** — a migration adding an enum value with no matching `domain.ts` update means the UI won't know how to label or color the new value; a `domain.ts` change with no migration means the database will reject inserts of a status that only exists in the frontend's imagination.

The kanban board's left-to-right column order is **not** the enum's declared order — it's whatever order `EVENT_STATUSES` lists them in inside `domain.ts`. The two happen to currently match, but if you ever reorder one, remember the other doesn't follow automatically.

## `events` table

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `company` | `text` | — | required |
| `type` | `event_type` | — | required |
| `round` | `text` | — | nullable; only meaningful when `type = 'INTERVIEW'` |
| `role` | `text` | — | nullable |
| `start_at` | `timestamptz` | — | required |
| `end_at` | `timestamptz` | — | nullable |
| `mode` | `event_mode` | `'ONLINE'` | |
| `location` | `text` | — | nullable — venue, meet link, or DC name depending on `mode` |
| `link` | `text` | — | nullable |
| `status` | `event_status` | `'UPCOMING'` | drives kanban column placement |
| `priority` | `event_priority` | `'MEDIUM'` | |
| `ctc` | `text` | — | nullable, free text (e.g. "18 LPA") — deliberately not numeric, since offers get expressed inconsistently |
| `resume_version` | `text` | — | nullable free-text tag |
| `contacts` | `jsonb` | `'[]'` | array of `{ name, email?, phone? }` — see `Contact` type in `domain.ts` |
| `prep_notes` | `text` | — | nullable, markdown |
| `outcome_notes` | `text` | — | nullable, post-event |
| `reminder_sent` | `boolean` | `false` | flipped by the reminder route once an email goes out |
| `reminder_sent_at` | `timestamptz` | — | nullable |
| `created_at` / `updated_at` | `timestamptz` | `now()` | `updated_at` auto-updates via trigger |

Indexes: `events_start_at_idx` (used by both the calendar/list sort and the reminder window query), `events_status_idx` (used by the kanban board's per-column grouping).

## `settings` table

Single-row table (no enforced constraint preventing a second row, but the app only ever reads/writes via `getSettings()`'s `.limit(1).maybeSingle()`, so a second row would just be silently ignored, not erred on).

| Column | Type | Default |
|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` |
| `reminder_email` | `text` | `'aneeshvrao2017@gmail.com'` |
| `reminders_enabled` | `boolean` | `true` |
| `from_email` | `text` | `'Placement Tracker <onboarding@resend.dev>'` |
| `created_at` / `updated_at` | `timestamptz` | `now()` |

## Row Level Security

Both tables have RLS **enabled but fully open** — every policy is `USING (true)` (and `WITH CHECK (true)` for writes). This is intentional: the app is single-user with no login screen, so there's no user ID to scope rows by. Grants: `anon`/`authenticated` get `SELECT, INSERT, UPDATE, DELETE`; `service_role` gets `ALL`. If multi-user auth is ever added, these policies are the first thing that needs to change — right now, anyone with the anon key (which ships in the client bundle, by design) has full read/write access to every row.

## Extensions

`pg_cron` and `pg_net` are enabled in the first migration. `pg_cron` schedules the reminder job; `pg_net` provides `net.http_post`, which is how the scheduled job actually reaches the app's HTTP endpoint from inside Postgres.
