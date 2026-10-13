import { describe, expect, it } from "vitest";

import { hourTicks, hoursInWindow, nowOffsetPct, placeRange } from "./timeline";

const START = Date.parse("2026-10-13T00:00:00Z");
const END = Date.parse("2026-10-14T00:00:00Z");

describe("placeRange", () => {
  it("places a range as percentages of the day", () => {
    const placement = placeRange(
      { start: "2026-10-13T06:00:00Z", end: "2026-10-13T12:00:00Z" },
      START,
      END,
    );
    expect(placement).toEqual({ leftPct: 25, widthPct: 25 });
  });

  it("clips ranges that cross the window edges", () => {
    expect(
      placeRange({ start: "2026-10-12T22:00:00Z", end: "2026-10-13T06:00:00Z" }, START, END),
    ).toEqual({ leftPct: 0, widthPct: 25 });
    expect(
      placeRange({ start: "2026-10-13T18:00:00Z", end: "2026-10-14T06:00:00Z" }, START, END),
    ).toEqual({ leftPct: 75, widthPct: 25 });
  });

  it("returns null when the range is outside, empty or touches the edge", () => {
    expect(placeRange({ start: "2026-10-14T00:00:00Z", end: "2026-10-14T01:00:00Z" }, START, END)).toBeNull();
    expect(placeRange({ start: "2026-10-12T22:00:00Z", end: "2026-10-13T00:00:00Z" }, START, END)).toBeNull();
    expect(placeRange({ start: "2026-10-13T10:00:00Z", end: "2026-10-13T10:00:00Z" }, START, END)).toBeNull();
  });

  it("is safe with a degenerate window", () => {
    expect(placeRange({ start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z" }, START, START)).toBeNull();
  });
});

describe("nowOffsetPct", () => {
  it("positions now inside the window", () => {
    expect(nowOffsetPct(Date.parse("2026-10-13T12:00:00Z"), START, END)).toBe(50);
  });

  it("is null when unknown (SSR) or outside the window", () => {
    expect(nowOffsetPct(null, START, END)).toBeNull();
    expect(nowOffsetPct(START - 1, START, END)).toBeNull();
    expect(nowOffsetPct(END, START, END)).toBeNull();
  });
});

describe("hours and ticks", () => {
  it("has one tick per hour with the hotel's local labels", () => {
    const ticks = hourTicks(START, END, "UTC");
    expect(ticks).toHaveLength(24);
    expect(ticks[0]).toEqual({ offsetPct: 0, label: "00:00" });
    expect(ticks[13]?.label).toBe("13:00");
    expect(ticks[12]?.offsetPct).toBe(50);
  });

  it("adapts to 23 and 25 hour days", () => {
    const spring = [Date.parse("2026-03-28T23:00:00Z"), Date.parse("2026-03-29T22:00:00Z")] as const;
    const autumn = [Date.parse("2026-10-24T22:00:00Z"), Date.parse("2026-10-25T23:00:00Z")] as const;
    expect(hoursInWindow(...spring)).toBe(23);
    expect(hoursInWindow(...autumn)).toBe(25);
    // Madrid skips 02:00 -> 03:00 in spring: the labels jump, the ticks stay evenly spaced.
    const labels = hourTicks(spring[0], spring[1], "Europe/Madrid").map((tick) => tick.label);
    expect(labels.slice(0, 4)).toEqual(["00:00", "01:00", "03:00", "04:00"]);
  });
});
