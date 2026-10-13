import { formatClock } from "@/shared/lib/zoned-time";

import { BOOKING_STATUS_LABEL, type Booking, type BookingStatus } from "../model/booking";

const STYLES: Record<BookingStatus, string> = {
  pending:
    "border-2 border-dashed border-amber-500 bg-amber-100/80 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100",
  confirmed: "bg-indigo-600 text-white",
  checked_in: "bg-emerald-600 text-white",
  completed: "bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  cancelled: "hidden",
  expired: "hidden",
};

/** Below this width (percent of the day, ~2 h) only the start time fits inside the block. */
export const COMPACT_WIDTH_PCT = 8.4;

type BookingBlockProps = {
  booking: Booking;
  timeZone: string;
  /** Horizontal placement inside the timeline, as percentages of its width. */
  leftPct: number;
  widthPct: number;
};

export function BookingBlock({ booking, timeZone, leftPct, widthPct }: BookingBlockProps) {
  const range = `${formatClock(booking.start, timeZone)}–${formatClock(booking.end, timeZone)}`;
  const label = `${BOOKING_STATUS_LABEL[booking.status]} ${range}`;
  // The full range always stays available to screen readers and on hover (title).
  const visibleText =
    widthPct < COMPACT_WIDTH_PCT ? formatClock(booking.start, timeZone) : range;
  return (
    <div
      role="listitem"
      data-booking-id={booking.id}
      data-status={booking.status}
      title={label}
      aria-label={label}
      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      className={`absolute inset-y-1.5 flex items-center overflow-hidden rounded-md px-1 text-[11px] font-medium tabular-nums shadow-sm transition-[left,width,background-color] duration-300 ${STYLES[booking.status]}`}
    >
      <span aria-hidden className="truncate">
        {visibleText}
      </span>
    </div>
  );
}
