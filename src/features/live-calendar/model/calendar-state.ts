import { isReleasedStatus, statusRank, type Booking } from "@/entities/booking";
import type { RoomStatus } from "@/entities/room";

import type { LiveEvent } from "./live-events";
import type { CalendarSnapshot, RoomCalendar } from "./snapshot";

/**
 * Client-side calendar state: the server snapshot plus the live events applied on top.
 * Pure and framework-free so every rule below is unit-tested without React.
 */
export type CalendarRoom = RoomCalendar & {
  /** `occurred_at` (ms) of the last room status event applied; guards against reordering. */
  statusAt: number;
};

export type CalendarState = {
  generatedAt: string;
  start: string;
  end: string;
  rooms: CalendarRoom[];
};

export type CalendarAction =
  | { type: "reset"; snapshot: CalendarSnapshot }
  | { type: "event"; event: LiveEvent };

export function createCalendarState(snapshot: CalendarSnapshot): CalendarState {
  return {
    generatedAt: snapshot.generatedAt,
    start: snapshot.start,
    end: snapshot.end,
    rooms: snapshot.rooms.map((room) => ({ ...room, statusAt: 0 })),
  };
}

export function calendarReducer(state: CalendarState, action: CalendarAction): CalendarState {
  switch (action.type) {
    case "reset":
      return createCalendarState(action.snapshot);
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: CalendarState, event: LiveEvent): CalendarState {
  switch (event.kind) {
    case "room-status":
      return applyRoomStatus(state, event.roomId, event.status, Date.parse(event.occurredAt));
    case "booking":
      return applyBooking(state, event.roomId, event.booking);
    // Connection-level messages are handled by the provider, not by the data model.
    case "connected":
    case "resync":
      return state;
  }
}

function updateRoom(
  state: CalendarState,
  roomId: string,
  update: (room: CalendarRoom) => CalendarRoom,
): CalendarState {
  const index = state.rooms.findIndex((room) => room.id === roomId);
  const current = state.rooms[index];
  if (current === undefined) return state; // a room this view does not know about
  const next = update(current);
  if (next === current) return state; // nothing changed: keep references, skip re-renders
  return { ...state, rooms: state.rooms.with(index, next) };
}

function applyRoomStatus(
  state: CalendarState,
  roomId: string,
  status: RoomStatus,
  occurredAt: number,
): CalendarState {
  return updateRoom(state, roomId, (room) => {
    // Events can arrive out of order across API replicas: the newest one wins.
    if (occurredAt < room.statusAt) return room;
    if (room.status === status && room.statusAt === occurredAt) return room;
    return { ...room, status, statusAt: occurredAt };
  });
}

function overlapsWindow(booking: Booking, state: CalendarState): boolean {
  return Date.parse(booking.start) < Date.parse(state.end) && Date.parse(booking.end) > Date.parse(state.start);
}

function sameBooking(a: Booking, b: Booking): boolean {
  return (
    a.status === b.status &&
    a.start === b.start &&
    a.end === b.end &&
    a.holdExpiresAt === b.holdExpiresAt
  );
}

function applyBooking(state: CalendarState, roomId: string, booking: Booking): CalendarState {
  return updateRoom(state, roomId, (room) => {
    const existing = room.bookings.find((candidate) => candidate.id === booking.id);

    // Cancelled / expired bookings release their range; bookings outside the window are noise.
    if (isReleasedStatus(booking.status) || !overlapsWindow(booking, state)) {
      if (existing === undefined) return room;
      return { ...room, bookings: room.bookings.filter((candidate) => candidate !== existing) };
    }

    if (existing !== undefined) {
      // Never move a booking backwards (late "hold_created" after "confirmed").
      if (statusRank(booking.status) < statusRank(existing.status)) return room;
      if (sameBooking(existing, booking)) return room;
    }

    const others = room.bookings.filter((candidate) => candidate.id !== booking.id);
    const bookings = [...others, booking].sort(
      (a, b) => Date.parse(a.start) - Date.parse(b.start),
    );
    return { ...room, bookings };
  });
}
