import "server-only";

import { fetchJson } from "@/shared/api/api-client";

import { calendarSnapshotSchema, type CalendarSnapshot } from "../model/snapshot";

type GetCalendarParams = {
  /** `API_BASE_URL`, without trailing slash. */
  baseUrl: string;
  /** Window `[start, end)`. */
  start: Date;
  end: Date;
};

/** Initial calendar state, fetched on the server (never cached: it must be current). */
export function getCalendarSnapshot({
  baseUrl,
  start,
  end,
}: GetCalendarParams): Promise<CalendarSnapshot> {
  const query = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
  return fetchJson(`${baseUrl}/api/v1/calendar?${query}`, calendarSnapshotSchema);
}
