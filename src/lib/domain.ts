import type { Database } from "@/integrations/supabase/types";

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
export type EventType = Database["public"]["Enums"]["event_type"];
export type EventMode = Database["public"]["Enums"]["event_mode"];
export type EventStatus = Database["public"]["Enums"]["event_status"];
export type EventPriority = Database["public"]["Enums"]["event_priority"];

export const EVENT_TYPES: { value: EventType; label: string; short: string }[] = [
  { value: "PPT", label: "Pre-Placement Talk", short: "PPT" },
  { value: "OT_ONLINE", label: "Online Test", short: "OT (Online)" },
  { value: "OT_OFFLINE", label: "Offline Test / DC", short: "OT (Offline)" },
  { value: "INTERVIEW", label: "Interview", short: "Interview" },
];

export const EVENT_MODES: { value: EventMode; label: string }[] = [
  { value: "ONLINE", label: "Online" },
  { value: "OFFLINE", label: "Offline" },
  { value: "HYBRID", label: "Hybrid" },
];

export const EVENT_PRIORITIES: { value: EventPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

export const EVENT_STATUSES: { value: EventStatus; label: string }[] = [
  { value: "UPCOMING", label: "Upcoming" },
  { value: "PPT_DONE", label: "PPT Done" },
  { value: "OT_SCHEDULED", label: "OT Scheduled" },
  { value: "OT_CLEARED", label: "OT Cleared" },
  { value: "INTERVIEW_R1", label: "Interview R1" },
  { value: "INTERVIEW_R2", label: "Interview R2" },
  { value: "HR", label: "HR Round" },
  { value: "OFFER", label: "Offer" },
  { value: "REJECTED", label: "Rejected" },
  { value: "GHOSTED", label: "Ghosted" },
];

export const STATUS_COLORS: Record<EventStatus, string> = {
  UPCOMING: "bg-slate-500",
  PPT_DONE: "bg-sky-500",
  OT_SCHEDULED: "bg-indigo-500",
  OT_CLEARED: "bg-violet-500",
  INTERVIEW_R1: "bg-amber-500",
  INTERVIEW_R2: "bg-orange-500",
  HR: "bg-pink-500",
  OFFER: "bg-emerald-500",
  REJECTED: "bg-rose-500",
  GHOSTED: "bg-zinc-500",
};

export const TYPE_COLORS: Record<EventType, string> = {
  PPT: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  OT_ONLINE: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  OT_OFFLINE: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  INTERVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

export function statusLabel(s: EventStatus) {
  return EVENT_STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function typeLabel(t: EventType) {
  return EVENT_TYPES.find((x) => x.value === t)?.short ?? t;
}

export type Contact = { name: string; email?: string; phone?: string };
