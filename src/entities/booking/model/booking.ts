import { z } from "zod";

export const bookingStatusSchema = z.enum([
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "expired",
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "On hold",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** Statuses that appear on the calendar. The others release their time range. */
export const VISIBLE_BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
] as const satisfies readonly BookingStatus[];

export function isReleasedStatus(status: BookingStatus): boolean {
  return status === "cancelled" || status === "expired";
}

/**
 * Forward-only lifecycle position. A late or duplicated event must never move a booking
 * backwards (e.g. a delayed "hold_created" after "confirmed").
 */
const RANK: Record<BookingStatus, number> = {
  pending: 0,
  confirmed: 1,
  checked_in: 2,
  completed: 3,
  cancelled: 4,
  expired: 4,
};

export function statusRank(status: BookingStatus): number {
  return RANK[status];
}

/** Occupancy of a room as shown on the board. ISO-8601 instants, no guest data. */
export type Booking = {
  id: string;
  status: BookingStatus;
  start: string;
  end: string;
  holdExpiresAt: string | null;
};
