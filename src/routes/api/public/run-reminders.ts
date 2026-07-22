import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/run-reminders")({
  server: {
    handlers: {
      POST: async () => runReminders(),
      GET: async () => runReminders(),
    },
  },
});

async function runReminders() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "Missing Supabase env" }, 500);
  }
  if (!RESEND_API_KEY) {
    return json({ ok: false, error: "Missing RESEND_API_KEY" }, 500);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings } = await supa.from("settings").select("*").limit(1).maybeSingle();
  if (!settings) return json({ ok: false, error: "No settings row" }, 500);
  if (!settings.reminders_enabled) return json({ ok: true, skipped: "disabled" });

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 3600 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 3600 * 1000);

  const { data: events, error } = await supa
    .from("events")
    .select("*")
    .eq("reminder_sent", false)
    .gte("start_at", windowStart.toISOString())
    .lte("start_at", windowEnd.toISOString());

  if (error) return json({ ok: false, error: error.message }, 500);

  const results: { id: string; company: string; sent: boolean; error?: string }[] = [];

  for (const ev of events ?? []) {
    try {
      const start = new Date(ev.start_at);
      const html = renderEmail(ev, start);
      const subject = `Reminder: ${ev.company} ${labelType(ev.type)} tomorrow at ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: settings.from_email || "Placement Tracker <onboarding@resend.dev>",
          to: [settings.reminder_email],
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        results.push({ id: ev.id, company: ev.company, sent: false, error: `Resend ${res.status}: ${body}` });
        continue;
      }

      await supa
        .from("events")
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .eq("id", ev.id);

      results.push({ id: ev.id, company: ev.company, sent: true });
    } catch (e) {
      results.push({ id: ev.id, company: ev.company, sent: false, error: (e as Error).message });
    }
  }

  return json({ ok: true, checked: events?.length ?? 0, results });
}

function labelType(t: string) {
  return t === "PPT" ? "PPT" : t === "OT_ONLINE" ? "Online Test" : t === "OT_OFFLINE" ? "Offline Test" : "Interview";
}

function renderEmail(ev: {
  company: string;
  type: string;
  round: string | null;
  role: string | null;
  start_at: string;
  mode: string;
  location: string | null;
  link: string | null;
  prep_notes: string | null;
}, start: Date) {
  const when = start.toLocaleString([], {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
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

  const table = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px">${k}</td><td style="padding:6px 0;font-size:14px;color:#0f172a"><strong>${v.startsWith("<a") ? v : escapeHtml(v)}</strong></td></tr>`
  ).join("");

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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
