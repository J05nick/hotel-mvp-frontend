import { describe, expect, it } from "vitest";

import {
  dateKeyOf,
  dayRange,
  formatClock,
  formatDateKey,
  isDateKey,
  isValidTimeZone,
  parseDateKey,
  shiftDateKey,
} from "./zoned-time";

const hours = (range: { start: Date; end: Date }) =>
  (range.end.getTime() - range.start.getTime()) / 3_600_000;

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects garbage", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/Bogota")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("parseDateKey / isDateKey", () => {
  it("accepts real calendar dates", () => {
    expect(parseDateKey("2026-10-13")).toEqual({ year: 2026, month: 10, day: 13 });
    expect(isDateKey("2028-02-29")).toBe(true); // leap day
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-1-5", "13-10-2026", "", "2026-10-13T00:00"])(
    "rejects %j",
    (value) => {
      expect(isDateKey(value)).toBe(false);
    },
  );
});

describe("shiftDateKey", () => {
  it("moves across months, years and leap days", () => {
    expect(shiftDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDateKey("2027-02-28", 1)).toBe("2027-03-01");
    expect(shiftDateKey("2026-10-13", 0)).toBe("2026-10-13");
  });

  it("throws on an invalid key", () => {
    expect(() => shiftDateKey("nope", 1)).toThrow(RangeError);
  });
});

describe("dateKeyOf", () => {
  it("returns the local calendar day of an instant", () => {
    const instant = new Date("2026-10-13T03:30:00Z");
    expect(dateKeyOf(instant, "UTC")).toBe("2026-10-13");
    expect(dateKeyOf(instant, "America/Bogota")).toBe("2026-10-12"); // UTC-5
    expect(dateKeyOf(instant, "Asia/Tokyo")).toBe("2026-10-13"); // UTC+9
  });
});

describe("dayRange", () => {
  it("is a 24 hour UTC day in UTC", () => {
    const range = dayRange("2026-10-13", "UTC");
    expect(range.start.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it("starts at local midnight in other zones", () => {
    const bogota = dayRange("2026-10-13", "America/Bogota"); // UTC-5, no DST
    expect(bogota.start.toISOString()).toBe("2026-10-13T05:00:00.000Z");
    expect(hours(bogota)).toBe(24);
    const tokyo = dayRange("2026-10-13", "Asia/Tokyo"); // UTC+9
    expect(tokyo.start.toISOString()).toBe("2026-10-12T15:00:00.000Z");
  });

  it("is 23 hours long when clocks go forward and 25 when they go back", () => {
    expect(hours(dayRange("2026-03-29", "Europe/Madrid"))).toBe(23);
    expect(hours(dayRange("2026-10-25", "Europe/Madrid"))).toBe(25);
    expect(hours(dayRange("2026-10-24", "Europe/Madrid"))).toBe(24);
  });

  it("handles a day that is midnight-adjacent to a DST jump", () => {
    // Santiago springs forward AT local midnight: 2026-09-06 00:00 does not exist.
    const range = dayRange("2026-09-06", "America/Santiago");
    expect(hours(range)).toBe(23);
    expect(dateKeyOf(range.start, "America/Santiago")).toBe("2026-09-06");
  });

  it("consecutive days tile without gaps or overlap", () => {
    const first = dayRange("2026-10-24", "Europe/Madrid");
    const second = dayRange("2026-10-25", "Europe/Madrid");
    expect(first.end.getTime()).toBe(second.start.getTime());
  });

  it("throws on an invalid key", () => {
    expect(() => dayRange("2026-02-30", "UTC")).toThrow(RangeError);
  });
});

describe("formatters", () => {
  it("formats the clock in the hotel zone with a 24 hour cycle", () => {
    expect(formatClock("2026-10-13T10:30:00Z", "UTC")).toBe("10:30");
    expect(formatClock("2026-10-13T10:30:00Z", "America/Bogota")).toBe("05:30");
    expect(formatClock(new Date("2026-10-13T00:05:00Z"), "UTC")).toBe("00:05");
  });

  it("formats a long date label without drifting across zones", () => {
    expect(formatDateKey("2026-10-13")).toBe("Tuesday, 13 October 2026");
    expect(formatDateKey("garbage")).toBe("garbage");
  });
});
