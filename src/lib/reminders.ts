export function reminderWindow(now: Date = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(now.getTime() + 23 * 3600 * 1000),
    end: new Date(now.getTime() + 25 * 3600 * 1000),
  };
}

export function labelType(t: string): string {
  return t === "PPT"
    ? "PPT"
    : t === "OT_ONLINE"
      ? "Online Test"
      : t === "OT_OFFLINE"
        ? "Offline Test"
        : "Interview";
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export type ReminderEvent = {
  company: string;
  type: string;
  round: string | null;
  role: string | null;
  start_at: string;
  mode: string;
  location: string | null;
  link: string | null;
  prep_notes: string | null;
};

export const DEFAULT_FROM_EMAIL = "Placement Tracker <onboarding@resend.dev>";

export type ReminderRecipient = {
  user_id: string | null;
  reminder_email: string;
  reminders_enabled: boolean;
  from_email: string;
};

// Pairs each due event with its owner's reminder settings. Multi-user now, so an
// event is only sent when it has an owner whose settings row exists and has
// reminders enabled. Events with user_id null (not yet backfilled) and events
// whose owner opted out are dropped rather than defaulting to some other user's
// email address.
export function planReminderSends<
  R extends ReminderRecipient,
  E extends { user_id: string | null },
>(recipients: readonly R[], events: readonly E[]): { recipient: R; event: E }[] {
  const enabledByUser = new Map(
    recipients
      .filter((r) => r.user_id !== null && r.reminders_enabled)
      .map((r) => [r.user_id as string, r]),
  );

  return events.flatMap((event) => {
    if (event.user_id === null) return [];
    const recipient = enabledByUser.get(event.user_id);
    return recipient ? [{ recipient, event }] : [];
  });
}

export function renderReminderEmail(ev: ReminderEvent, start: Date): string {
  const when = start.toLocaleString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const rows = [
    ["Company", ev.company],
    ["Type", labelType(ev.type)],
    ev.round ? ["Round", ev.round] : null,
    ev.role ? ["Role", ev.role] : null,
    ["When", when],
    ["Mode", ev.mode],
    ev.location ? ["Location", ev.location] : null,
    ev.link ? ["Link", `<a href="${escapeHtml(ev.link)}">${escapeHtml(ev.link)}</a>`] : null,
  ].filter(Boolean) as [string, string][];

  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px">${k}</td><td style="padding:6px 0;font-size:14px;color:#0f172a"><strong>${v.startsWith("<a") ? v : escapeHtml(v)}</strong></td></tr>`,
    )
    .join("");

  const notes = ev.prep_notes
    ? `<div style="margin-top:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px;font-size:13px;color:#334155;white-space:pre-wrap">${escapeHtml(ev.prep_notes)}</div>`
    : "";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <div style="font-size:12px;color:#f59e0b;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Reminder · 24 hours away</div>
      <h1 style="font-size:24px;margin:6px 0 4px">${escapeHtml(ev.company)}</h1>
      <p style="color:#64748b;margin:0 0 20px">${labelType(ev.type)}${ev.round ? " · " + escapeHtml(ev.round) : ""}</p>
      <table style="border-collapse:collapse">${table}</table>
      ${notes}
      <hr style="margin:28px 0;border:none;border-top:1px solid #e2e8f0" />
      <p style="font-size:12px;color:#94a3b8">Sent by your Placement Tracker.</p>
    </div>
  `;
}
