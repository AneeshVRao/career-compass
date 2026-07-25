-- Multi-user auth: add per-user ownership, user-scoped RLS, and a signup trigger.
--
-- ORDERING: this migration is safe to run immediately. It intentionally leaves
-- user_id NULLABLE on both tables so pre-existing rows (which have no owner yet)
-- are not rejected. The companion migration
-- 20260725120100_lockdown_user_id_not_null.sql flips both columns to NOT NULL and
-- must be run ONLY AFTER the manual data backfill described in docs/DEPLOYMENT.md
-- ("Multi-user data backfill runbook"). Until that backfill runs, pre-existing
-- events/settings rows keep user_id IS NULL and are invisible to every logged-in
-- user (RLS below matches on auth.uid() = user_id) — that is expected.

-- events ownership. Default auth.uid() so new inserts self-scope without the
-- client passing user_id explicitly.
alter table public.events
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
create index if not exists events_user_id_idx on public.events(user_id);

-- settings ownership: one row per user. A unique index on a nullable column still
-- permits multiple NULLs in Postgres, so pre-backfill rows coexist without error.
alter table public.settings
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
create unique index if not exists settings_user_id_key on public.settings(user_id);

-- Auto-provision a default settings row for every new signup. SECURITY DEFINER so
-- it can write to public.settings from inside the auth.users insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.settings (user_id, reminder_email)
  values (new.id, coalesce(new.email, 'onboarding@resend.dev'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: replace the fully-open (USING true) policies with per-user ownership.
drop policy if exists "Public read events" on public.events;
drop policy if exists "Public insert events" on public.events;
drop policy if exists "Public update events" on public.events;
drop policy if exists "Public delete events" on public.events;

create policy "Users read own events" on public.events
  for select using (auth.uid() = user_id);
create policy "Users insert own events" on public.events
  for insert with check (auth.uid() = user_id);
create policy "Users update own events" on public.events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own events" on public.events
  for delete using (auth.uid() = user_id);

drop policy if exists "Public read settings" on public.settings;
drop policy if exists "Public write settings" on public.settings;

create policy "Users read own settings" on public.settings
  for select using (auth.uid() = user_id);
create policy "Users insert own settings" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "Users update own settings" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own settings" on public.settings
  for delete using (auth.uid() = user_id);

-- There is no longer a single shared dataset, so anon gets no table access at all.
-- authenticated keeps its grants (RLS narrows them to each user's own rows);
-- service_role keeps ALL (the reminder job bypasses RLS via the service key).
revoke select, insert, update, delete on public.events from anon;
revoke select, insert, update, delete on public.settings from anon;
