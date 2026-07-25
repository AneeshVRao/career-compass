# Database

Schema reference for the Supabase/Postgres backend. Source of truth is always `supabase/migrations/`; this file is a readable transcription of it, not a replacement — if the two ever disagree, the migrations are correct and this file is stale.

## Migrations (chronological)

1. **`20260722131142_8274acba-a280-46aa-83b5-f2549fdcb9b8.sql`** — the original schema: creates the four enums, the `events` and `settings` tables, RLS policies, indexes, the `updated_at` trigger, and enables the `pg_cron`/`pg_net` extensions (but does not yet schedule any cron job — see below).
2. **`20260722201059_schedule_reminder_cron.sql`** — creates a `private.app_secrets` table (see below) and the actual `cron.schedule(...)` job that invokes the reminder endpoint every 15 minutes. Ships with a `<PROD_APP_URL>` placeholder that must be filled in by hand once a deploy target exists (see `docs/DEPLOYMENT.md`), and reads its auth header from a row in `private.app_secrets` that must be inserted by hand first, never committed.
3. **`20260725120000_multi_user_auth.sql`** — multi-user auth. Adds `user_id` to `events` and `settings` (nullable, defaulting to `auth.uid()`), a unique index on `settings.user_id`, the `handle_new_user()` trigger on `auth.users`, and replaces every fully-open RLS policy with a user-scoped one. Also revokes `anon`'s table grants. Safe to run immediately.
4. **`20260725120100_lockdown_user_id_not_null.sql`** — **deferred on purpose.** Sets `user_id NOT NULL` on both tables. It only succeeds after the one-time manual backfill has given every pre-existing row an owner; run before that and it fails with a NOT NULL violation, which is the intended guard. Runbook: `docs/DEPLOYMENT.md` → "Multi-user data backfill runbook".

## Enums

| Enum             | Values                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `event_type`     | `PPT`, `OT_ONLINE`, `OT_OFFLINE`, `INTERVIEW`                                                                              |
| `event_mode`     | `ONLINE`, `OFFLINE`, `HYBRID`                                                                                              |
| `event_status`   | `UPCOMING`, `PPT_DONE`, `OT_SCHEDULED`, `OT_CLEARED`, `INTERVIEW_R1`, `INTERVIEW_R2`, `HR`, `OFFER`, `REJECTED`, `GHOSTED` |
| `event_priority` | `LOW`, `MEDIUM`, `HIGH`                                                                                                    |

Each of these has a TypeScript mirror in `src/lib/domain.ts` (`EventType`, `EventMode`, `EventStatus`, `EventPriority`) plus a generated mirror in `src/integrations/supabase/types.ts`. **All three must move together** — a migration adding an enum value with no matching `domain.ts` update means the UI won't know how to label or color the new value; a `domain.ts` change with no migration means the database will reject inserts of a status that only exists in the frontend's imagination.

The kanban board's left-to-right column order is **not** the enum's declared order — it's whatever order `EVENT_STATUSES` lists them in inside `domain.ts`. The two happen to currently match, but if you ever reorder one, remember the other doesn't follow automatically.

## `events` table

| Column                      | Type             | Default             | Notes                                                                                                                                   |
| --------------------------- | ---------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | `uuid`           | `gen_random_uuid()` | PK                                                                                                                                      |
| `company`                   | `text`           | —                   | required                                                                                                                                |
| `type`                      | `event_type`     | —                   | required                                                                                                                                |
| `round`                     | `text`           | —                   | nullable; only meaningful when `type = 'INTERVIEW'`                                                                                     |
| `role`                      | `text`           | —                   | nullable                                                                                                                                |
| `start_at`                  | `timestamptz`    | —                   | required                                                                                                                                |
| `end_at`                    | `timestamptz`    | —                   | nullable                                                                                                                                |
| `mode`                      | `event_mode`     | `'ONLINE'`          |                                                                                                                                         |
| `location`                  | `text`           | —                   | nullable — venue, meet link, or DC name depending on `mode`                                                                             |
| `link`                      | `text`           | —                   | nullable                                                                                                                                |
| `status`                    | `event_status`   | `'UPCOMING'`        | drives kanban column placement                                                                                                          |
| `priority`                  | `event_priority` | `'MEDIUM'`          |                                                                                                                                         |
| `ctc`                       | `text`           | —                   | nullable, free text (e.g. "18 LPA") — deliberately not numeric, since offers get expressed inconsistently                               |
| `resume_version`            | `text`           | —                   | nullable free-text tag                                                                                                                  |
| `contacts`                  | `jsonb`          | `'[]'`              | array of `{ name, email?, phone? }` — see `Contact` type in `domain.ts`                                                                 |
| `prep_notes`                | `text`           | —                   | nullable, markdown                                                                                                                      |
| `outcome_notes`             | `text`           | —                   | nullable, post-event                                                                                                                    |
| `reminder_sent`             | `boolean`        | `false`             | flipped by the reminder route once an email goes out                                                                                    |
| `reminder_sent_at`          | `timestamptz`    | —                   | nullable                                                                                                                                |
| `user_id`                   | `uuid`           | `auth.uid()`        | FK → `auth.users(id)`, `ON DELETE CASCADE`. Owner of the row; every RLS policy keys off it. Currently **nullable** — see the note below |
| `created_at` / `updated_at` | `timestamptz`    | `now()`             | `updated_at` auto-updates via trigger                                                                                                   |

Indexes: `events_start_at_idx` (used by both the calendar/list sort and the reminder window query), `events_status_idx` (used by the kanban board's per-column grouping), `events_user_id_idx` (per-user scoping).

**Why `user_id` is nullable.** The `auth.uid()` default self-scopes _new_ inserts, so the client never passes `user_id` — but a default does nothing for rows that already existed when the column was added. Those keep `user_id IS NULL` until the manual backfill runs, and because RLS matches `auth.uid() = user_id`, a NULL-owner row is invisible to every logged-in user (it is not a shared row — it belongs to nobody). The follow-up lockdown migration flips the column to `NOT NULL` once the backfill is done.

## `settings` table

**One row per user**, not one row globally — that changed with multi-user auth. A unique index on `user_id` enforces it, and `handle_new_user()` creates the row automatically at signup, so application code never has to insert one. `getSettings()` accordingly dropped its old `.limit(1)`: RLS already narrows the query to the caller's single row, and keeping `.limit(1)` would silently mask a duplicate-row bug rather than surfacing it.

| Column                      | Type          | Default                                                                                        |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `id`                        | `uuid`        | `gen_random_uuid()`                                                                            |
| `user_id`                   | `uuid`        | `auth.uid()`                                                                                   |
| `reminder_email`            | `text`        | `'aneeshvrao2017@gmail.com'` (the signup trigger overrides this with the new user's own email) |
| `reminders_enabled`         | `boolean`     | `true`                                                                                         |
| `from_email`                | `text`        | `'Placement Tracker <onboarding@resend.dev>'`                                                  |
| `created_at` / `updated_at` | `timestamptz` | `now()`                                                                                        |

`user_id` is `UNIQUE`, FK → `auth.users(id)` `ON DELETE CASCADE` (deleting a user removes their settings and events), and nullable for the same pre-backfill reason as `events.user_id`. Postgres allows multiple NULLs under a unique index, so ownerless legacy rows coexist with real ones without tripping the constraint.

## `handle_new_user()` trigger

`AFTER INSERT ON auth.users`, `SECURITY DEFINER` (it needs to write `public.settings` from inside the auth schema's insert). Inserts a settings row for the new user with `reminder_email` set to their own signup email, `ON CONFLICT (user_id) DO NOTHING` so it is idempotent. This is why a brand-new account lands on `/settings` with a populated row instead of an error.

## `private.app_secrets` table

A small key-value table in its own `private` schema (not `public`), created by the second migration. Holds the reminder cron's shared secret so it can be read from inside a `pg_cron` job's SQL body:

| Column  | Type        |
| ------- | ----------- |
| `key`   | `text` (PK) |
| `value` | `text`      |

Exists specifically because Supabase's hosted Postgres refuses `ALTER DATABASE`/`ALTER ROLE ... SET` for custom GUC parameters (`permission denied to set parameter`, requires true superuser) — see `docs/DECISIONS.md` for the full story. No `GRANT` is given to `anon`/`authenticated`, and `private` is never added to PostgREST's exposed-schemas list, so this table is unreachable via the app's normal REST API paths regardless — only direct SQL access (the SQL editor, or a role like `postgres`/`service_role` that owns/bypasses table-level restrictions) can read it. Currently holds exactly one row: `key = 'reminder_cron_secret'`.

## Row Level Security

RLS is **enabled and user-scoped** on both tables. Every policy is `USING (auth.uid() = user_id)`, with a matching `WITH CHECK (auth.uid() = user_id)` on every write, across all four verbs:

| Table      | Policies                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`   | "Users read own events" (SELECT), "Users insert own events" (INSERT), "Users update own events" (UPDATE), "Users delete own events" (DELETE) |
| `settings` | "Users read own settings", "Users insert own settings", "Users update own settings", "Users delete own settings"                             |

These replaced the original `USING (true)` policies from the first migration, which were only defensible while the app was single-user with no login screen.

Grants now: **`anon` has none** — its `SELECT, INSERT, UPDATE, DELETE` on both tables was revoked, because there is no longer a shared dataset for an unauthenticated visitor to legitimately read. `authenticated` keeps all four verbs (RLS narrows them to the caller's own rows). `service_role` keeps `ALL`, which is what lets the reminder cron see every user's rows.

The consequence worth internalising: the anon key still ships in the client bundle by design, but it now grants **nothing** on its own — a session cookie carrying a real user JWT is what unlocks data, and only that user's own rows.

**The `anon` revocation is not in any migration.** It was applied by hand in the SQL editor, so `supabase/migrations/` still reads `GRANT ... TO anon, authenticated` from the first migration and the live database disagrees with it. Anyone replaying the migrations into a fresh project gets a database that does _not_ match production. If you rebuild the schema anywhere, re-apply the revoke by hand:

```sql
revoke all on public.events, public.settings from anon;
```

This also means pre-auth code cannot work against the live project at all — see `docs/STATUS.md`.

### Telling a GRANT failure apart from an RLS failure

Worth knowing, because the two look similar from the app and have completely different fixes — and with user-scoped RLS you can now hit either:

| Symptom                                                | Cause                                                         | Fix                                         |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------- |
| `200` with `[]`                                        | RLS policy matched no rows — wrong user, or `user_id IS NULL` | Fix ownership, or sign in as the right user |
| `401`/`403` with `42501 permission denied for table X` | The role has no table-level `GRANT`                           | `GRANT ... TO <role>`                       |
| `401` with `Invalid API key`                           | Bad or rotated key                                            | Fix the key                                 |

RLS silently filters; a missing GRANT refuses outright. If you see `42501`, stop looking at policies — the query never got far enough to reach them.

## Extensions

`pg_cron` and `pg_net` are enabled in the first migration. `pg_cron` schedules the reminder job; `pg_net` provides `net.http_post`, which is how the scheduled job actually reaches the app's HTTP endpoint from inside Postgres.
