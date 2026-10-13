import type { CalendarSnapshot } from "@/features/live-calendar";

/** The day used across tests: 2026-10-13, UTC. */
export const DAY_START = "2026-10-13T00:00:00Z";
export const DAY_END = "2026-10-14T00:00:00Z";

export const ROOM_A = "11111111-1111-4111-8111-111111111111";
export const ROOM_B = "22222222-2222-4222-8222-222222222222";
export const BOOKING_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const BOOKING_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export function makeSnapshot(overrides: Partial<CalendarSnapshot> = {}): CalendarSnapshot {
  return {
    generatedAt: "2026-10-13T08:00:00Z",
    start: DAY_START,
    end: DAY_END,
    rooms: [
      {
        id: ROOM_A,
        number: "101",
        name: "Garden suite",
        capacity: 2,
        pricePerBlockCents: 1500,
        status: "available",
        bookings: [
          {
            id: BOOKING_1,
            status: "confirmed",
            start: "2026-10-13T10:00:00Z",
            end: "2026-10-13T11:00:00Z",
            holdExpiresAt: null,
          },
        ],
      },
      {
        id: ROOM_B,
        number: "102",
        name: "Sea view",
        capacity: 4,
        pricePerBlockCents: 2500,
        status: "cleaning",
        bookings: [],
      },
    ],
    ...overrides,
  };
}

/** A calendar response exactly as the FastAPI backend serialises it. */
export function makeCalendarDto() {
  return {
    generated_at: "2026-10-13T08:00:00.123456Z",
    start: DAY_START,
    end: DAY_END,
    rooms: [
      {
        id: ROOM_A,
        number: "101",
        name: "Garden suite",
        capacity: 2,
        price_per_block_cents: 1500,
        status: "available",
        bookings: [
          {
            id: BOOKING_1,
            status: "confirmed",
            start: "2026-10-13T10:00:00Z",
            end: "2026-10-13T11:00:00Z",
            hold_expires_at: null,
          },
        ],
      },
      {
        id: ROOM_B,
        number: "102",
        name: "Sea view",
        capacity: 4,
        price_per_block_cents: 2500,
        status: "cleaning",
        bookings: [],
      },
    ],
  };
}

type BookingWire = {
  type: string;
  roomId: string;
  bookingId?: string;
  status?: string;
  start?: string;
  end?: string;
  holdExpiresAt?: string | null;
  occurredAt?: string;
};

/** A booking event exactly as the backend publishes it on `/ws/events`. */
export function bookingMessage({
  type,
  roomId,
  bookingId = BOOKING_2,
  status = "confirmed",
  start = "2026-10-13T12:00:00Z",
  end = "2026-10-13T13:00:00Z",
  holdExpiresAt = null,
  occurredAt = "2026-10-13T08:05:00Z",
}: BookingWire) {
  return {
    v: 1,
    type,
    occurred_at: occurredAt,
    room_id: roomId,
    data: { booking_id: bookingId, status, start, end, hold_expires_at: holdExpiresAt },
  };
}

export function roomStatusMessage(
  roomId: string,
  status: string,
  previous: string | null,
  occurredAt = "2026-10-13T08:05:00Z",
) {
  return {
    v: 1,
    type: "room.status_changed",
    occurred_at: occurredAt,
    room_id: roomId,
    data: { status, previous_status: previous },
  };
}

export const systemMessage = (type: "system.connected" | "system.resync") => ({
  v: 1,
  type,
  occurred_at: "2026-10-13T08:05:00Z",
  room_id: null,
  data: {},
});
