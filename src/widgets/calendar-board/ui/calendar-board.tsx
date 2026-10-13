"use client";

import { useMemo } from "react";

import { ROOM_STATUS_LABEL, type RoomStatus } from "@/entities/room";
import { useCalendar } from "@/features/live-calendar";
import { useNow } from "@/shared/lib/use-now";

import { hourTicks, hoursInWindow } from "../lib/timeline";
import { ConnectionBadge } from "./connection-badge";
import { RoomRow } from "./room-row";
import { TimeAxis } from "./time-axis";

const LEGEND = [
  { label: "On hold", swatch: "border-2 border-dashed border-amber-500 bg-amber-100" },
  { label: "Confirmed", swatch: "bg-indigo-600" },
  { label: "Checked in", swatch: "bg-emerald-600" },
  { label: "Completed", swatch: "bg-slate-300 dark:bg-slate-600" },
];

const STATUS_ORDER: RoomStatus[] = ["available", "occupied", "cleaning", "maintenance"];

/** The day board: a timeline per room that updates itself from the WebSocket. */
export function CalendarBoard({ timeZone }: { timeZone: string }) {
  const calendar = useCalendar();
  const now = useNow(30_000);

  const windowStart = Date.parse(calendar.start);
  const windowEnd = Date.parse(calendar.end);
  const hours = hoursInWindow(windowStart, windowEnd);
  const ticks = useMemo(
    () => hourTicks(windowStart, windowEnd, timeZone),
    [windowStart, windowEnd, timeZone],
  );

  const counts = useMemo(() => {
    const result: Record<RoomStatus, number> = {
      available: 0,
      occupied: 0,
      cleaning: 0,
      maintenance: 0,
    };
    for (const room of calendar.rooms) result[room.status] += 1;
    return result;
  }, [calendar.rooms]);

  return (
    <section aria-label="Room calendar" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p
          aria-live="polite"
          data-testid="status-summary"
          className="flex flex-wrap gap-x-4 text-sm text-slate-600 dark:text-slate-300"
        >
          {STATUS_ORDER.map((status) => (
            <span key={status} data-count-for={status}>
              <strong className="font-semibold tabular-nums">{counts[status]}</strong>{" "}
              {ROOM_STATUS_LABEL[status].toLowerCase()}
            </span>
          ))}
        </p>
        <ConnectionBadge />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <div className="min-w-[1300px]">
          <TimeAxis ticks={ticks} />
          {calendar.rooms.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No rooms yet.</p>
          ) : (
            <ul>
              {calendar.rooms.map((room) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                  hours={hours}
                  timeZone={timeZone}
                  now={now}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-3 rounded-sm ${item.swatch}`} />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
