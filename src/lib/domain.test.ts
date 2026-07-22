import { describe, it, expect } from "vitest";
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  STATUS_COLORS,
  TYPE_COLORS,
  statusLabel,
  typeLabel,
} from "./domain";

describe("statusLabel", () => {
  it("returns the label for every known status", () => {
    for (const s of EVENT_STATUSES) {
      expect(statusLabel(s.value)).toBe(s.label);
    }
  });

  it("falls back to the raw value for an unknown status", () => {
    // @ts-expect-error deliberately testing an out-of-domain value
    expect(statusLabel("NOT_A_STATUS")).toBe("NOT_A_STATUS");
  });
});

describe("typeLabel", () => {
  it("returns the short label for every known type", () => {
    for (const t of EVENT_TYPES) {
      expect(typeLabel(t.value)).toBe(t.short);
    }
  });

  it("falls back to the raw value for an unknown type", () => {
    // @ts-expect-error deliberately testing an out-of-domain value
    expect(typeLabel("NOT_A_TYPE")).toBe("NOT_A_TYPE");
  });
});

describe("enum/color table invariants", () => {
  it("STATUS_COLORS has an entry for every EVENT_STATUSES value", () => {
    const statusKeys = Object.keys(STATUS_COLORS).sort();
    const eventStatusValues = EVENT_STATUSES.map((s) => s.value).sort();
    expect(statusKeys).toEqual(eventStatusValues);
  });

  it("TYPE_COLORS has an entry for every EVENT_TYPES value", () => {
    const typeKeys = Object.keys(TYPE_COLORS).sort();
    const eventTypeValues = EVENT_TYPES.map((t) => t.value).sort();
    expect(typeKeys).toEqual(eventTypeValues);
  });
});
