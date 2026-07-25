-- LOCKDOWN STEP — DO NOT RUN THIS MIGRATION IMMEDIATELY.
--
-- Run this ONLY AFTER the one-time manual data backfill (docs/DEPLOYMENT.md,
-- "Multi-user data backfill runbook") has assigned every pre-existing
-- events/settings row an owner. Before the backfill, those rows still have
-- user_id IS NULL and these ALTERs will fail with a NOT NULL violation — which
-- is the intended guard: it refuses to lock down until ownership exists.
--
-- The preceding migration (20260725120000_multi_user_auth.sql) is the one that
-- is safe to apply immediately; this file is the deferred follow-up.

alter table public.events alter column user_id set not null;
alter table public.settings alter column user_id set not null;
