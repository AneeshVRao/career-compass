
-- Enums
CREATE TYPE public.event_type AS ENUM ('PPT', 'OT_ONLINE', 'OT_OFFLINE', 'INTERVIEW');
CREATE TYPE public.event_mode AS ENUM ('ONLINE', 'OFFLINE', 'HYBRID');
CREATE TYPE public.event_status AS ENUM (
  'UPCOMING','PPT_DONE','OT_SCHEDULED','OT_CLEARED',
  'INTERVIEW_R1','INTERVIEW_R2','HR','OFFER','REJECTED','GHOSTED'
);
CREATE TYPE public.event_priority AS ENUM ('LOW','MEDIUM','HIGH');

-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  type public.event_type NOT NULL,
  round TEXT,
  role TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  mode public.event_mode NOT NULL DEFAULT 'ONLINE',
  location TEXT,
  link TEXT,
  status public.event_status NOT NULL DEFAULT 'UPCOMING',
  priority public.event_priority NOT NULL DEFAULT 'MEDIUM',
  ctc TEXT,
  resume_version TEXT,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  prep_notes TEXT,
  outcome_notes TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public insert events" ON public.events FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update events" ON public.events FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete events" ON public.events FOR DELETE USING (true);

CREATE INDEX events_start_at_idx ON public.events(start_at);
CREATE INDEX events_status_idx ON public.events(status);

-- Settings table (single-row)
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reminder_email TEXT NOT NULL DEFAULT 'aneeshvrao2017@gmail.com',
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  from_email TEXT NOT NULL DEFAULT 'Placement Tracker <onboarding@resend.dev>',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Public write settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.settings (reminder_email) VALUES ('aneeshvrao2017@gmail.com');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable extensions for scheduled reminders
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
