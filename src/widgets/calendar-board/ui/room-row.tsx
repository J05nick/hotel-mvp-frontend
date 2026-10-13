import { memo } from "react";

import { BookingBlock } from "@/entities/booking";
import { RoomStatusBadge } from "@/entities/room";
import type { CalendarRoom } from "@/features/live-calendar";

import { nowOffsetPct, placeRange } from "../lib/timeline";

type RoomRowProps = {
  room: CalendarRoom;
  windowStart: number;
  windowEnd: number;
  hours: number;
  timeZone: string;
  /** Epoch ms of "now", or `null` before hydration (keeps server and client markup equal). */
  now: number | null;
};

function RoomRowImpl({ room, windowStart, windowEnd, hours, timeZone, now }: RoomRowProps) {
  const nowPct = nowOffsetPct(now, windowStart, windowEnd);

  return (
    <li
      data-room-id={room.id}
      data-room-status={room.status}
      className="grid grid-cols-[13rem_1fr] border-b border-slate-100 last:border-b-0 dark:border-slate-800"
    >
      <div className="sticky left-0 z-10 flex flex-col gap-1 bg-white px-4 py-3 dark:bg-slate-950">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold tabular-nums">{room.number}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{room.capacity} guests</span>
        </div>
        <span className="truncate text-sm text-slate-600 dark:text-slate-300">{room.name}</span>
        <RoomStatusBadge status={room.status} />
      </div>

      <div
        role="list"
        aria-label={`Bookings of room ${room.number}`}
        className="relative min-h-16"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, var(--grid-line) 0 1px, transparent 1px calc(100% / var(--hours)))",
          ["--hours" as string]: hours,
        }}
      >
        {room.bookings.map((booking) => {
          // A hold past its deadline no longer blocks the range, even before the server
          // sweep announces it.
          const lapsed =
            booking.status === "pending" &&
            booking.holdExpiresAt !== null &&
            now !== null &&
            Date.parse(booking.holdExpiresAt) <= now;
          const placement = lapsed ? null : placeRange(booking, windowStart, windowEnd);
          if (placement === null) return null;
          return (
            <BookingBlock
              key={booking.id}
              booking={booking}
              timeZone={timeZone}
              leftPct={placement.leftPct}
              widthPct={placement.widthPct}
            />
          );
        })}
        {nowPct !== null && (
          <div
            aria-hidden
            data-testid="now-marker"
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-rose-500"
            style={{ left: `${nowPct}%` }}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Memoised: reducer updates keep the identity of rooms that did not change, so a live event
 * for one room re-renders only that row.
 */
export const RoomRow = memo(RoomRowImpl);
