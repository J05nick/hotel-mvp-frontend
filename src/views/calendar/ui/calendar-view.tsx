import { connection } from "next/server";

import { CalendarProvider } from "@/features/live-calendar";
import { getCalendarSnapshot } from "@/features/live-calendar/server";
import { CalendarBoard } from "@/widgets/calendar-board";
import { getServerEnv } from "@/shared/config/server-env";
import { dateKeyOf, dayRange } from "@/shared/lib/zoned-time";

import { resolveDateKey } from "../lib/resolve-date";
import { DayNavigation } from "./day-navigation";

type CalendarViewProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * React Server Component. It reads the initial calendar state on the server, so the first
 * paint already contains every room and booking (no client-side loading waterfall). The
 * client then only takes over live updates through `CalendarProvider`.
 *
 * Everything here depends on the request (query string, environment, wall clock), so the
 * page renders it inside <Suspense> and the static shell is served immediately.
 */
export async function CalendarView({ searchParams }: CalendarViewProps) {
  await connection(); // from here on: request time (wall clock + runtime environment)

  const env = getServerEnv();
  const now = new Date();
  const dateKey = resolveDateKey((await searchParams).date, now, env.HOTEL_TIMEZONE);
  const { start, end } = dayRange(dateKey, env.HOTEL_TIMEZONE);

  const snapshot = await getCalendarSnapshot({ baseUrl: env.API_BASE_URL, start, end });

  return (
    <CalendarProvider initial={snapshot} wsUrl={env.WS_URL}>
      <div className="flex flex-col gap-4">
        <DayNavigation
          dateKey={dateKey}
          isToday={dateKey === dateKeyOf(now, env.HOTEL_TIMEZONE)}
        />
        <CalendarBoard timeZone={env.HOTEL_TIMEZONE} />
      </div>
    </CalendarProvider>
  );
}
