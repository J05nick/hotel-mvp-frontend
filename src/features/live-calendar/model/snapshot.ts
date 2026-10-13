import { z } from "zod";

import { bookingStatusSchema, type Booking } from "@/entities/booking";
import { roomStatusSchema, type Room } from "@/entities/room";

/** `GET /api/v1/calendar` — snake_case wire format, validated at the boundary. */
const instant = z.iso.datetime({ offset: true });

const bookingDto = z.object({
  id: z.string().min(1),
  status: bookingStatusSchema,
  start: instant,
  end: instant,
  hold_expires_at: instant.nullable(),
});

const roomDto = z.object({
  id: z.string().min(1),
  number: z.string(),
  name: z.string(),
  capacity: z.number().int(),
  price_per_block_cents: z.number().int(),
  status: roomStatusSchema,
  bookings: z.array(bookingDto),
});

export type RoomCalendar = Room & { bookings: Booking[] };

/** Internal camelCase model. It is plain data, so it can cross the RSC -> client boundary. */
export type CalendarSnapshot = {
  /** Server clock when the snapshot was read. */
  generatedAt: string;
  /** Visible window `[start, end)`, ISO-8601. */
  start: string;
  end: string;
  rooms: RoomCalendar[];
};

export const calendarSnapshotSchema = z
  .object({
    generated_at: instant,
    start: instant,
    end: instant,
    rooms: z.array(roomDto),
  })
  .transform(
    (dto): CalendarSnapshot => ({
      generatedAt: dto.generated_at,
      start: dto.start,
      end: dto.end,
      rooms: dto.rooms.map((room) => ({
        id: room.id,
        number: room.number,
        name: room.name,
        capacity: room.capacity,
        pricePerBlockCents: room.price_per_block_cents,
        status: room.status,
        bookings: room.bookings.map((booking) => ({
          id: booking.id,
          status: booking.status,
          start: booking.start,
          end: booking.end,
          holdExpiresAt: booking.hold_expires_at,
        })),
      })),
    }),
  );
