import { TZDate } from "@date-fns/tz";

/**
 * Time-zone aware helpers for the hotel calendar.
 *
 * A "date key" is a plain `YYYY-MM-DD` string. The hotel's day runs from local midnight to
 * the next local midnight in its IANA time zone, which is 23 or 25 hours long on DST changes.
 * All instants cross the wire as ISO-8601 strings; only display uses the zone.
 */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Parses a strict `YYYY-MM-DD` that also exists on the calendar (rejects 2026-02-30). */
export function parseDateKey(
  key: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_KEY.exec(key);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const exists =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return exists ? { year, month, day } : null;
}

export function isDateKey(value: string): boolean {
  return parseDateKey(value) !== null;
}

/** The calendar day an instant falls on, in `timeZone`. */
export function dateKeyOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** `key` moved by `days` calendar days (zone independent: pure date arithmetic). */
export function shiftDateKey(key: string, days: number): string {
  const parsed = parseDateKey(key);
  if (!parsed) throw new RangeError(`Invalid date key: ${key}`);
  const moved = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return moved.toISOString().slice(0, 10);
}

/** `[start, end)` instants of the local day `key` in `timeZone`. */
export function dayRange(key: string, timeZone: string): { start: Date; end: Date } {
  const parsed = parseDateKey(key);
  if (!parsed) throw new RangeError(`Invalid date key: ${key}`);
  const { year, month, day } = parsed;
  return {
    start: new Date(new TZDate(year, month - 1, day, timeZone).getTime()),
    end: new Date(new TZDate(year, month - 1, day + 1, timeZone).getTime()),
  };
}

/** `HH:mm` (24 h) of an instant in `timeZone`. */
export function formatClock(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(typeof instant === "string" ? new Date(instant) : instant);
}

/** Long human label for a date key, e.g. "Tuesday, 13 October 2026". */
export function formatDateKey(key: string): string {
  const parsed = parseDateKey(key);
  if (!parsed) return key;
  // Noon UTC rendered in UTC: the label never drifts across a day boundary.
  const noon = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(noon);
}
