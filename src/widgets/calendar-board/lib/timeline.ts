import { formatClock } from "@/shared/lib/zoned-time";

const HOUR_MS = 3_600_000;

export type Placement = { leftPct: number; widthPct: number };

/**
 * Horizontal position of a time range inside the window `[windowStart, windowEnd)`, as
 * percentages. Ranges are clipped to the window; ranges entirely outside return `null`.
 */
export function placeRange(
  range: { start: string; end: string },
  windowStart: number,
  windowEnd: number,
): Placement | null {
  const span = windowEnd - windowStart;
  if (span <= 0) return null;
  const from = Math.max(Date.parse(range.start), windowStart);
  const to = Math.min(Date.parse(range.end), windowEnd);
  if (!(to > from)) return null;
  return {
    leftPct: ((from - windowStart) / span) * 100,
    widthPct: ((to - from) / span) * 100,
  };
}

/** Percentage offset of `now`, or `null` when `now` is unknown or outside the window. */
export function nowOffsetPct(
  now: number | null,
  windowStart: number,
  windowEnd: number,
): number | null {
  if (now === null || now < windowStart || now >= windowEnd) return null;
  return ((now - windowStart) / (windowEnd - windowStart)) * 100;
}

/** Number of whole hours in the window (23 / 25 on daylight-saving days). */
export function hoursInWindow(windowStart: number, windowEnd: number): number {
  return Math.max(1, Math.round((windowEnd - windowStart) / HOUR_MS));
}

export type Tick = { offsetPct: number; label: string };

/** One tick per elapsed hour of the window, labelled with the hotel's local clock. */
export function hourTicks(windowStart: number, windowEnd: number, timeZone: string): Tick[] {
  const hours = hoursInWindow(windowStart, windowEnd);
  const span = windowEnd - windowStart;
  return Array.from({ length: hours }, (_, hour) => {
    const instant = windowStart + hour * HOUR_MS;
    return {
      offsetPct: ((instant - windowStart) / span) * 100,
      label: formatClock(new Date(instant), timeZone),
    };
  });
}
