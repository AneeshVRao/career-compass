import { supabase } from "@/integrations/supabase/client";
import type { EventInsert, EventRow, EventStatus } from "./domain";

export async function listEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createEvent(input: EventInsert): Promise<EventRow> {
  const { data, error } = await supabase.from("events").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateEvent(id: string, patch: Partial<EventInsert>): Promise<EventRow> {
  const { data, error } = await supabase
    .from("events")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function setStatus(id: string, status: EventStatus) {
  return updateEvent(id, { status });
}

export async function getSettings() {
  const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateSettings(patch: {
  reminder_email?: string;
  reminders_enabled?: boolean;
  from_email?: string;
}) {
  const current = await getSettings();
  if (!current) throw new Error("Settings row missing");
  const { data, error } = await supabase
    .from("settings")
    .update(patch)
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
