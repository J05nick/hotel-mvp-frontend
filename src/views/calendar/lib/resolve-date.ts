import { dateKeyOf, isDateKey } from "@/shared/lib/zoned-time";

/**
 * The day to show: the `?date=YYYY-MM-DD` query when it is a real calendar date, otherwise
 * today in the hotel's time zone (bad input degrades to "today" instead of an error page).
 */
export function resolveDateKey(
  requested: string | string[] | undefined,
  now: Date,
  timeZone: string,
): string {
  const candidate = Array.isArray(requested) ? requested[0] : requested;
  return candidate !== undefined && isDateKey(candidate) ? candidate : dateKeyOf(now, timeZone);
}
