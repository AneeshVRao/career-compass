-- Run this once by hand in the Supabase SQL editor BEFORE applying this migration,
-- with your own generated secret (e.g. `openssl rand -hex 32`). Never commit the value
-- itself -- this line is a template, not something to run as-is from a migration file.
-- ALTER DATABASE postgres SET app.reminder_cron_secret = '<paste-generated-secret>';

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
      'x-reminder-cron-secret', current_setting('app.reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
