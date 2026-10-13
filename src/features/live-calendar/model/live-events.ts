import { z } from "zod";

import { bookingStatusSchema, type Booking } from "@/entities/booking";
import { roomStatusSchema, type RoomStatus } from "@/entities/room";

/**
 * Messages of `ws://<api>/ws/events` (envelope version 1).
 * Anything that does not match is dropped: the socket is an untrusted input.
 */
const instant = z.iso.datetime({ offset: true });

const bookingData = z.object({
  booking_id: z.string().min(1),
  status: bookingStatusSchema,
  start: instant,
  end: instant,
  hold_expires_at: instant.nullable(),
});

export type BookingEventType =
  | "booking.hold_created"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.completed"
  | "booking.expired";

const envelope = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({
    v: z.literal(1),
    type: z.literal(type),
    occurred_at: instant,
    room_id: z.string().min(1).nullable(),
    data,
  });

const roomStatusData = z.object({
  status: roomStatusSchema,
  previous_status: roomStatusSchema.nullable(),
});

const messageSchema = z.discriminatedUnion("type", [
  envelope("booking.hold_created", bookingData),
  envelope("booking.confirmed", bookingData),
  envelope("booking.cancelled", bookingData),
  envelope("booking.completed", bookingData),
  envelope("booking.expired", bookingData),
  envelope("room.status_changed", roomStatusData),
  envelope("system.connected", z.object({})),
  envelope("system.resync", z.object({})),
]);

export type LiveEvent =
  | {
      kind: "booking";
      type: BookingEventType;
      occurredAt: string;
      roomId: string;
      booking: Booking;
    }
  | {
      kind: "room-status";
      occurredAt: string;
      roomId: string;
      status: RoomStatus;
      previousStatus: RoomStatus | null;
    }
  | { kind: "connected" }
  | { kind: "resync" };

/** Parses one text frame. Returns `null` for malformed or unknown messages. */
export function parseLiveEvent(raw: string): LiveEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = messageSchema.safeParse(json);
  if (!parsed.success) return null;
  const message = parsed.data;

  switch (message.type) {
    case "system.connected":
      return { kind: "connected" };
    case "system.resync":
      return { kind: "resync" };
    case "room.status_changed":
      if (message.room_id === null) return null;
      return {
        kind: "room-status",
        occurredAt: message.occurred_at,
        roomId: message.room_id,
        status: message.data.status,
        previousStatus: message.data.previous_status,
      };
    case "booking.hold_created":
    case "booking.confirmed":
    case "booking.cancelled":
    case "booking.completed":
    case "booking.expired":
      if (message.room_id === null) return null;
      return {
        kind: "booking",
        type: message.type,
        occurredAt: message.occurred_at,
        roomId: message.room_id,
        booking: {
          id: message.data.booking_id,
          status: message.data.status,
          start: message.data.start,
          end: message.data.end,
          holdExpiresAt: message.data.hold_expires_at,
        },
      };
  }
}
