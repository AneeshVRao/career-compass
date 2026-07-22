import { describe, it, expect } from "vitest";
import { escapeHtml, labelType, reminderWindow, renderReminderEmail } from "./reminders";

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
