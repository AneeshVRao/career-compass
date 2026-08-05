import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  DEFAULT_FROM_EMAIL,
  labelType,
  planReminderSends,
  reminderWindow,
  renderReminderEmail,
} from "@/lib/reminders";
import { formatTime } from "@/lib/datetime";

export const Route = createFileRoute("/api/public/run-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => guardedRunReminders(request),
      GET: async ({ request }) => guardedRunReminders(request),
    },
  },
});

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.REMINDER_CRON_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-reminder-cron-secret") ?? "";
  return safeCompare(provided, expected);
}

async function guardedRunReminders(request: Request) {
  // An unauthenticated caller learns nothing about our configuration: a missing
  // secret and a wrong secret are indistinguishable from outside. The operator
  // still gets the real reason in the server log.
  if (!process.env.REMINDER_CRON_SECRET) {
    console.error("run-reminders: REMINDER_CRON_SECRET is not configured; refusing all requests");
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  if (!isAuthorized(request)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return runReminders();
}

async function runReminders() {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return json({ ok: false, error: "Missing RESEND_API_KEY" }, 500);
  }

  // Runs with the service-role client so the user-scoped RLS policies don't hide
  // other users' rows from the cron job — it legitimately needs to see everyone's.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settingsRows, error: settingsError } = await supabaseAdmin
    .from("settings")
    .select("*");
  if (settingsError) return json({ ok: false, error: settingsError.message }, 500);

  const { start: windowStart, end: windowEnd } = reminderWindow();

  const { data: events, error } = await supabaseAdmin
    .from("events")
    .select("*")
    .eq("reminder_sent", false)
    .gte("start_at", windowStart.toISOString())
    .lte("start_at", windowEnd.toISOString());

  if (error) return json({ ok: false, error: error.message }, 500);

  const sends = planReminderSends(settingsRows ?? [], events ?? []);

  const results: {
    id: string;
    company: string;
    user_id: string | null;
    sent: boolean;
    error?: string;
  }[] = [];

  for (const { recipient, event: ev } of sends) {
    try {
      const start = new Date(ev.start_at);
      const html = renderReminderEmail(ev, start);
      // Zone-pinned like the email body: this runs on a UTC server, so the plain
      // `toLocaleTimeString()` here put the wrong time in every subject line.
      const subject = `Reminder: ${ev.company} ${labelType(ev.type)} tomorrow at ${formatTime(start)}`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: recipient.from_email || DEFAULT_FROM_EMAIL,
          to: [recipient.reminder_email],
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        results.push({
          id: ev.id,
          company: ev.company,
          user_id: ev.user_id,
          sent: false,
          error: `Resend ${res.status}: ${body}`,
        });
        continue;
      }

      // ponytail: send-then-mark. Sequential cron runs are deduped by the
      // reminder_sent filter above; two *overlapping* runs could double-send.
      // Swap for an atomic `update ... where reminder_sent = false returning *`
      // claim before sending if the job ever runs concurrently.
      const { error: markError } = await supabaseAdmin
        .from("events")
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .eq("id", ev.id);

      if (markError) {
        // The email already went out. Swallowing this would silently re-send it
        // on every subsequent run until the event leaves the window.
        results.push({
          id: ev.id,
          company: ev.company,
          user_id: ev.user_id,
          sent: true,
          error: `Sent but not marked, will re-send: ${markError.message}`,
        });
        continue;
      }

      results.push({ id: ev.id, company: ev.company, user_id: ev.user_id, sent: true });
    } catch (e) {
      results.push({
        id: ev.id,
        company: ev.company,
        user_id: ev.user_id,
        sent: false,
        error: (e as Error).message,
      });
    }
  }

  return json({
    ok: true,
    recipients: settingsRows?.length ?? 0,
    dueEvents: events?.length ?? 0,
    checked: sends.length,
    results,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
