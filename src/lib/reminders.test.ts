import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  labelType,
  planReminderSends,
  reminderWindow,
  renderReminderEmail,
} from "./reminders";

describe("reminderWindow", () => {
  it("returns exactly +23h and +25h from the given instant", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const { start, end } = reminderWindow(now);
    expect(start.toISOString()).toBe("2026-07-23T11:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-23T13:00:00.000Z");
  });

  it("defaults to the current time when no argument is given", () => {
    const before = Date.now();
    const { start } = reminderWindow();
    const after = Date.now();
    const elapsed = start.getTime() - 23 * 3600 * 1000;
    expect(elapsed).toBeGreaterThanOrEqual(before);
    expect(elapsed).toBeLessThanOrEqual(after);
  });
});

describe("labelType", () => {
  it("labels every known event type", () => {
    expect(labelType("PPT")).toBe("PPT");
    expect(labelType("OT_ONLINE")).toBe("Online Test");
    expect(labelType("OT_OFFLINE")).toBe("Offline Test");
    expect(labelType("INTERVIEW")).toBe("Interview");
  });

  it("falls back to Interview for an unknown type", () => {
    expect(labelType("SOMETHING_ELSE")).toBe("Interview");
  });
});

describe("escapeHtml", () => {
  it("escapes all five special characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Google SDE Intern")).toBe("Google SDE Intern");
  });
});

describe("renderReminderEmail", () => {
  const start = new Date("2026-07-23T15:30:00.000Z");
  const base = {
    company: "Acme Corp",
    type: "INTERVIEW",
    round: null,
    role: null,
    start_at: start.toISOString(),
    mode: "ONLINE",
    location: null,
    link: null,
    prep_notes: null,
  };

  it("includes required fields and omits optional fields when absent", () => {
    const html = renderReminderEmail(base, start);
    expect(html).toContain("Acme Corp");
    expect(html).toContain("Interview");
    expect(html).not.toContain("Round");
    expect(html).not.toContain("Location");
    expect(html).not.toContain("Link");
  });

  it("includes optional fields when present, and escapes user content", () => {
    const html = renderReminderEmail(
      {
        ...base,
        round: "Tech R1",
        role: "SDE Intern",
        location: "DC-2",
        link: "https://meet.example.com/room",
        prep_notes: "Review <DSA> & system design",
      },
      start,
    );
    expect(html).toContain("Tech R1");
    expect(html).toContain("SDE Intern");
    expect(html).toContain("DC-2");
    expect(html).toContain('<a href="https://meet.example.com/room">');
    expect(html).toContain("Review &lt;DSA&gt; &amp; system design");
  });
});

describe("planReminderSends", () => {
  const recipient = (user_id: string | null, overrides: Record<string, unknown> = {}) => ({
    user_id,
    reminder_email: `${user_id}@example.com`,
    reminders_enabled: true,
    from_email: "Tracker <no-reply@example.com>",
    ...overrides,
  });
  const event = (id: string, user_id: string | null) => ({ id, user_id });

  it("pairs each event with its own owner's settings", () => {
    const sends = planReminderSends(
      [recipient("u1"), recipient("u2")],
      [event("e1", "u1"), event("e2", "u2")],
    );
    expect(sends.map((s) => [s.event.id, s.recipient.reminder_email])).toEqual([
      ["e1", "u1@example.com"],
      ["e2", "u2@example.com"],
    ]);
  });

  it("never sends one user's event to another user's address", () => {
    expect(planReminderSends([recipient("u1")], [event("e2", "u2")])).toEqual([]);
  });

  it("skips events whose owner disabled reminders", () => {
    const sends = planReminderSends(
      [recipient("u1", { reminders_enabled: false }), recipient("u2")],
      [event("e1", "u1"), event("e2", "u2")],
    );
    expect(sends.map((s) => s.event.id)).toEqual(["e2"]);
  });

  it("skips ownerless events left over from before the backfill", () => {
    const sends = planReminderSends([recipient("u1")], [event("e0", null), event("e1", "u1")]);
    expect(sends.map((s) => s.event.id)).toEqual(["e1"]);
  });

  it("ignores an ownerless settings row rather than treating it as a catch-all", () => {
    expect(planReminderSends([recipient(null)], [event("e0", null), event("e1", "u1")])).toEqual(
      [],
    );
  });

  it("sends every due event of a single user", () => {
    const sends = planReminderSends(
      [recipient("u1")],
      [event("e1", "u1"), event("e2", "u1"), event("e3", "u1")],
    );
    expect(sends).toHaveLength(3);
    expect(sends.every((s) => s.recipient.reminder_email === "u1@example.com")).toBe(true);
  });

  it("returns nothing when there are no recipients or no events", () => {
    expect(planReminderSends([], [event("e1", "u1")])).toEqual([]);
    expect(planReminderSends([recipient("u1")], [])).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const recipients = [recipient("u1")];
    const events = [event("e1", "u1")];
    const recipientsBefore = structuredClone(recipients);
    const eventsBefore = structuredClone(events);
    planReminderSends(recipients, events);
    expect(recipients).toEqual(recipientsBefore);
    expect(events).toEqual(eventsBefore);
  });
});
