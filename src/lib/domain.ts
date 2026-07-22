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
  UPCOMING: "bg-muted-foreground",
  PPT_DONE: "bg-chart-4",
  OT_SCHEDULED: "bg-brass",
  OT_CLEARED: "bg-brass-bright",
  INTERVIEW_R1: "bg-chart-5",
  INTERVIEW_R2: "bg-chart-3",
  HR: "bg-chart-1",
  OFFER: "bg-ledger-bright",
  REJECTED: "bg-stamp",
  GHOSTED: "bg-border",
};

export const TYPE_COLORS: Record<EventType, string> = {
  PPT: "bg-chart-4/15 text-chart-4 border-chart-4/40",
  OT_ONLINE: "bg-brass/15 text-brass border-brass/40",
  OT_OFFLINE: "bg-ledger/20 text-ledger-bright border-ledger/40",
  INTERVIEW: "bg-chart-5/15 text-chart-5 border-chart-5/40",
};

export function statusLabel(s: EventStatus) {
  return EVENT_STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function typeLabel(t: EventType) {
  return EVENT_TYPES.find((x) => x.value === t)?.short ?? t;
}

export type Contact = { name: string; email?: string; phone?: string };
