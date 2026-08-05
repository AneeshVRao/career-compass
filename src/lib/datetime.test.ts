import { describe, expect, test } from "vitest";
import {
  DISPLAY_TIME_ZONE,
  formatCardDateTime,
  formatEmailWhen,
  formatHeaderDate,
  formatListDateTime,
  formatLongDateTime,
  formatTime,
  formatTime24,
  fromZonedInputValue,
  todayInZone,
  toZonedInputValue,
  zonedDayKey,
} from "./datetime";

// 09:00 IST on Sunday 26 July 2026. Deliberately an instant whose UTC calendar
// day (the 26th, 03:30) and IST calendar day agree, so the *later* cases that
// straddle midnight stand out as the interesting ones.
const MORNING = "2026-07-26T03:30:00.000Z";

// 01:30 IST on Monday 27 July — but 20:00 UTC on Sunday the 26th. This is the
// instant that used to render as a different day depending on who rendered it.
const ACROSS_MIDNIGHT = "2026-07-26T20:00:00.000Z";

describe("DISPLAY_TIME_ZONE", () => {
  test("defaults to the campus zone rather than the host's", () => {
    expect(DISPLAY_TIME_ZONE).toBe("Asia/Kolkata");
  });
});

describe("zonedDayKey", () => {
  test("returns the calendar day in the display zone, not UTC", () => {
    // Arrange: an instant that is still the 26th in UTC.
    // Act
    const key = zonedDayKey(ACROSS_MIDNIGHT);
    // Assert: in IST it has already rolled over to the 27th.
    expect(key).toBe("2026-07-27");
  });

  test("agrees with the UTC day when the instant does not straddle midnight", () => {
    expect(zonedDayKey(MORNING)).toBe("2026-07-26");
  });

  test("accepts a Date as well as an ISO string", () => {
    expect(zonedDayKey(new Date(MORNING))).toBe("2026-07-26");
  });

  test("zero-pads single-digit months and days", () => {
    expect(zonedDayKey("2026-01-05T06:00:00.000Z")).toBe("2026-01-05");
  });
});

describe("todayInZone", () => {
  test("carries the display zone's calendar day in local fields", () => {
    // Arrange: 20:00 UTC, which is already tomorrow in IST.
    const day = todayInZone(new Date(ACROSS_MIDNIGHT));
    // Assert: date-fns reads these local fields for its grid math.
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(6); // July, zero-indexed
    expect(day.getDate()).toBe(27);
  });

  test("is midnight local, so day-grid comparisons are stable", () => {
    const day = todayInZone(new Date(MORNING));
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
  });
});

describe("display formatters", () => {
  test("format an instant in the display zone", () => {
    expect(formatCardDateTime(MORNING)).toBe("Jul 26 · 9:00 AM");
    expect(formatLongDateTime(MORNING)).toBe("Sun, Jul 26 · 9:00 AM");
    expect(formatListDateTime(MORNING)).toBe("Jul 26, 9:00 AM");
    expect(formatTime(MORNING)).toBe("9:00 AM");
    expect(formatTime24(MORNING)).toBe("09:00");
    expect(formatEmailWhen(MORNING)).toBe("Sunday, Jul 26, 9:00 AM");
    expect(formatHeaderDate(MORNING)).toBe("Sunday, Jul 26");
  });

  test("roll the date forward for instants past zone midnight", () => {
    // The whole point: UTC still says the 26th at 8 PM.
    expect(formatCardDateTime(ACROSS_MIDNIGHT)).toBe("Jul 27 · 1:30 AM");
    expect(formatEmailWhen(ACROSS_MIDNIGHT)).toBe("Monday, Jul 27, 1:30 AM");
  });

  test("render midnight as 00:00 rather than 24:00", () => {
    // 2026-07-25T18:30Z is exactly 00:00 IST on the 26th.
    expect(formatTime24("2026-07-25T18:30:00.000Z")).toBe("00:00");
  });

  test("differ from a host-local render, which is the bug being prevented", () => {
    // Every literal above is an IST rendering, so on a UTC CI box they are already
    // the regression test. This case makes the failure mode explicit rather than
    // implicit: a naive host-local format of the same instant on a UTC server
    // disagrees with what this module produces, and that disagreement is exactly
    // what used to reach both the SSR'd HTML and the reminder emails.
    const naiveOnUtcServer = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Etc/UTC",
    }).format(new Date(ACROSS_MIDNIGHT));

    expect(naiveOnUtcServer).toBe("Jul 26, 8:00 PM");
    expect(formatCardDateTime(ACROSS_MIDNIGHT)).toBe("Jul 27 · 1:30 AM");
  });
});

describe("datetime-local round trip", () => {
  test("toZonedInputValue renders the instant as zone wall-clock", () => {
    expect(toZonedInputValue(MORNING)).toBe("2026-07-26T09:00");
  });

  test("toZonedInputValue rolls past midnight in the zone", () => {
    expect(toZonedInputValue(ACROSS_MIDNIGHT)).toBe("2026-07-27T01:30");
  });

  test("fromZonedInputValue reads wall-clock as the display zone", () => {
    expect(fromZonedInputValue("2026-07-26T09:00")).toBe(MORNING);
  });

  test("round-trips an instant unchanged", () => {
    // Arrange
    const original = ACROSS_MIDNIGHT;
    // Act
    const roundTripped = fromZonedInputValue(toZonedInputValue(original));
    // Assert
    expect(roundTripped).toBe(original);
  });

  test("round-trips a wall-clock value unchanged", () => {
    const wallClock = "2026-12-31T23:45";
    expect(toZonedInputValue(fromZonedInputValue(wallClock))).toBe(wallClock);
  });

  test("handles midnight without emitting hour 24", () => {
    expect(toZonedInputValue("2026-07-25T18:30:00.000Z")).toBe("2026-07-26T00:00");
    expect(fromZonedInputValue("2026-07-26T00:00")).toBe("2026-07-25T18:30:00.000Z");
  });

  test("resolves the zone offset at the given instant, not a fixed one", () => {
    // IST has no DST, so the offset is +05:30 in both January and July. A zone
    // that does observe DST would differ between these two, which is what the
    // offset lookup exists to handle.
    expect(fromZonedInputValue("2026-01-15T12:00")).toBe("2026-01-15T06:30:00.000Z");
    expect(fromZonedInputValue("2026-07-15T12:00")).toBe("2026-07-15T06:30:00.000Z");
  });
});
