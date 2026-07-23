-- Private table for secrets that need to be readable from inside a pg_cron
-- job's SQL body. Supabase's hosted Postgres does NOT allow ALTER DATABASE
-- or ALTER ROLE ... SET for custom GUC parameters from the SQL editor --
-- that requires true superuser, which the platform intentionally doesn't
-- grant even to the `postgres` role there. This table is the standard
-- workaround. It lives in the `private` schema, which (unlike `public`) is
-- never exposed via PostgREST/the REST API, and no GRANT is given to
-- anon/authenticated -- normal app clients (and the browser-facing anon key)
-- can never read it.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Run this once by hand in the Supabase SQL editor, with your own generated
-- secret (e.g. `openssl rand -hex 32`). Never commit the value itself -- this
-- is a template, not something to run as-is from a migration file.
-- INSERT INTO private.app_secrets (key, value) VALUES ('reminder_cron_secret', '<paste-generated-secret>')
--   ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- Re-runnable: drop any existing job with this name before recreating it.
select cron.unschedule('placement-tracker-reminders')
where exists (select 1 from cron.job where jobname = 'placement-tracker-reminders');

select cron.schedule(
  'placement-tracker-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := '<PROD_APP_URL>/api/public/run-reminders', -- TODO: replace with your deployed app URL
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-cron-secret', (select value from private.app_secrets where key = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
