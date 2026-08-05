// Every instant this app displays is rendered in ONE fixed zone, not in "whatever
// zone the machine doing the rendering happens to be in".
//
// Two separate bugs made this necessary, and they have the same root cause:
//
//   1. SSR hydration. `format(new Date(iso), ...)` renders in the server's zone
//      during SSR (Render runs UTC) and in the browser's zone on the client. Every
//      date on every card was therefore a hydration mismatch that React silently
//      patched — a visible flash of the wrong time, and on `/calendar` an event
//      bucketed into the wrong day cell until the client took over.
//   2. Reminder emails. `run-reminders.ts` runs on that same UTC server, so a
//      21:00 IST interview went out as "3:30 PM". Nothing in the UI could reveal
//      this, because the UI was reading the same instant in the reader's own zone.
//
// Pinning the zone fixes both at once and makes the two agree with each other.
//
// This is a single-campus tool: everyone tracking a placement season is sitting in
// the same timezone, so one configured zone is the correct model — not per-user
// zones, and not the viewer's local zone. Override with VITE_DISPLAY_TIME_ZONE if
// that ever stops being true.
export const DISPLAY_TIME_ZONE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DISPLAY_TIME_ZONE) || "Asia/Kolkata";

// Intl.DateTimeFormat construction is the expensive part; the formatting itself is
// cheap. These render once per card per list, so the cache matters.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let cached = formatterCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", { ...options, timeZone: DISPLAY_TIME_ZONE });
    formatterCache.set(key, cached);
  }
  return cached;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * The calendar date an instant falls on *in the display zone*, as `yyyy-MM-dd`.
 *
 * This is the day-bucketing key for `/calendar`. It must not go through
 * `date-fns`' `format`, which reads the host's local fields: a 20:00Z event is
 * July 26 to a UTC server and July 27 in IST, so the two disagree about which
 * cell it belongs in.
 */
export function zonedDayKey(value: string | Date): string {
  const parts = formatter({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    toDate(value),
  );
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * "Now", as a Date whose *local* fields carry the display zone's wall-clock date.
 *
 * Calendar-grid math (`startOfMonth`, `eachDay`, `isSameDay`) is date-fns' job and
 * date-fns reads local fields, so feeding it a plain `new Date()` reintroduces the
 * server/client split at month and day boundaries. Shifting the wall clock into
 * local fields lets that math stay unchanged and still agree on both sides.
 *
 * The result is a *calendar day*, not a valid instant — use it only for grid math,
 * never to compute a duration or store a timestamp.
 */
export function todayInZone(now: Date = new Date()): Date {
  const [year, month, day] = zonedDayKey(now).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** `Jul 26 · 9:00 AM` — the timestamp line on an EventCard. */
export function formatCardDateTime(value: string | Date): string {
  // Intl gives "Jul 26, 9:00 AM" — the sole comma separates date from time.
  return formatter({
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(toDate(value))
    .replace(",", " ·");
}

/** `Sun, Jul 26 · 9:00 AM` — the dashboard's "next up" line. */
export function formatLongDateTime(value: string | Date): string {
  // Intl gives "Sun, Jul 26, 9:00 AM"; only the last comma separates date from time.
  return formatter({
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(toDate(value))
    .replace(/,(?=[^,]*$)/, " ·");
}

/** `Jul 26, 9:00 AM` — the list view's compact column. */
export function formatListDateTime(value: string | Date): string {
  return formatter({
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(toDate(value));
}

/** `9:00 AM` — calendar chips and the email subject line. */
export function formatTime(value: string | Date): string {
  return formatter({ hour: "numeric", minute: "2-digit" }).format(toDate(value));
}

/** `09:00` — the 24h label inside a calendar day cell. */
export function formatTime24(value: string | Date): string {
  return formatter({ hour: "2-digit", minute: "2-digit", hour12: false }).format(toDate(value));
}

/** `Sunday, Jul 26, 9:00 AM` — the "When" row in a reminder email. */
export function formatEmailWhen(value: string | Date): string {
  return formatter({
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(toDate(value));
}

/** `EEEE, MMM d` for the dashboard header — a calendar day, no time. */
export function formatHeaderDate(value: string | Date): string {
  return formatter({ weekday: "long", month: "short", day: "numeric" }).format(toDate(value));
}

/**
 * The `datetime-local` input value for an instant, in the display zone.
 *
 * The drawer previously round-tripped through `getTimezoneOffset()`, which reads
 * the *browser's* offset — so editing an event from a machine in another zone
 * silently rewrote its start time. Pinning this to the same zone as the display
 * means what the form shows is what the card shows.
 */
export function toZonedInputValue(iso: string): string {
  const parts = formatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  // Intl renders midnight as hour "24" in some ICU versions; normalise it.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/**
 * Inverse of {@link toZonedInputValue}: read a `datetime-local` value as wall-clock
 * time in the display zone and return the UTC instant it denotes.
 *
 * Derives the zone's offset at that moment (so DST is handled) rather than
 * assuming a fixed one.
 */
export function fromZonedInputValue(value: string): string {
  // Interpret the wall-clock fields as if they were UTC, then correct by the
  // offset the display zone was actually at around that time.
  const asUtc = new Date(`${value}:00.000Z`);
  const offsetMs = zoneOffsetMs(asUtc);
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

/** How far ahead of UTC the display zone is at a given instant, in milliseconds. */
function zoneOffsetMs(instant: Date): number {
  const parts = formatter({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  // formatToParts has no millisecond component, so compare against the instant
  // truncated to the second — the difference is then exactly the zone offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}
