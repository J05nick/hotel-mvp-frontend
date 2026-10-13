import { describe, expect, it } from "vitest";

import { BOOKING_1, BOOKING_2, ROOM_A, ROOM_B, makeSnapshot } from "@tests/fixtures";

import { calendarReducer, createCalendarState, type CalendarState } from "./calendar-state";
import type { LiveEvent } from "./live-events";

const initial = () => createCalendarState(makeSnapshot());
const room = (state: CalendarState, id: string) => {
  const found = state.rooms.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`room ${id} missing`);
  return found;
};
const apply = (state: CalendarState, event: LiveEvent) =>
  calendarReducer(state, { type: "event", event });

const bookingEvent = (
  overrides: Partial<Extract<LiveEvent, { kind: "booking" }>["booking"]> & {
    roomId?: string;
    type?: Extract<LiveEvent, { kind: "booking" }>["type"];
  } = {},
): LiveEvent => {
  const { roomId = ROOM_B, type = "booking.hold_created", ...booking } = overrides;
  return {
    kind: "booking",
    type,
    occurredAt: "2026-10-13T08:05:00Z",
    roomId,
    booking: {
      id: BOOKING_2,
      status: "pending",
      start: "2026-10-13T12:00:00Z",
      end: "2026-10-13T13:00:00Z",
      holdExpiresAt: "2026-10-13T08:10:00Z",
      ...booking,
    },
  };
};

const roomStatus = (
  roomId: string,
  status: "available" | "occupied" | "cleaning" | "maintenance",
  occurredAt = "2026-10-13T08:05:00Z",
): LiveEvent => ({ kind: "room-status", occurredAt, roomId, status, previousStatus: null });

describe("createCalendarState / reset", () => {
  it("mirrors the snapshot", () => {
    const state = initial();
    expect(state.rooms.map((r) => r.number)).toEqual(["101", "102"]);
    expect(room(state, ROOM_A).bookings).toHaveLength(1);
  });

  it("reset replaces everything with a newer snapshot", () => {
    const changed = apply(initial(), bookingEvent());
    const fresh = makeSnapshot({ generatedAt: "2026-10-13T09:00:00Z", rooms: [] });
    const state = calendarReducer(changed, { type: "reset", snapshot: fresh });
    expect(state.generatedAt).toBe("2026-10-13T09:00:00Z");
    expect(state.rooms).toEqual([]);
  });
});

describe("room status events", () => {
  it("updates only the affected room and keeps the others by reference", () => {
    const before = initial();
    const after = apply(before, roomStatus(ROOM_B, "available"));
    expect(room(after, ROOM_B).status).toBe("available");
    expect(room(after, ROOM_A)).toBe(room(before, ROOM_A));
  });

  it("ignores events for rooms it does not show", () => {
    const before = initial();
    expect(apply(before, roomStatus("unknown-room", "cleaning"))).toBe(before);
  });

  it("returns the same state for a duplicate event", () => {
    const once = apply(initial(), roomStatus(ROOM_B, "available"));
    expect(apply(once, roomStatus(ROOM_B, "available"))).toBe(once);
  });

  it("lets the newest event win when events arrive out of order", () => {
    const afterNewer = apply(initial(), roomStatus(ROOM_A, "cleaning", "2026-10-13T09:00:00Z"));
    const afterStale = apply(afterNewer, roomStatus(ROOM_A, "occupied", "2026-10-13T08:00:00Z"));
    expect(room(afterStale, ROOM_A).status).toBe("cleaning");
    expect(afterStale).toBe(afterNewer);
  });

  it("applies a later event after an earlier one", () => {
    const first = apply(initial(), roomStatus(ROOM_A, "cleaning", "2026-10-13T09:00:00Z"));
    const second = apply(first, roomStatus(ROOM_A, "available", "2026-10-13T09:30:00Z"));
    expect(room(second, ROOM_A).status).toBe("available");
  });
});

describe("booking events", () => {
  it("adds a new hold to the right room, in chronological order", () => {
    const state = apply(initial(), bookingEvent({ roomId: ROOM_A, start: "2026-10-13T08:00:00Z", end: "2026-10-13T09:00:00Z" }));
    expect(room(state, ROOM_A).bookings.map((b) => b.id)).toEqual([BOOKING_2, BOOKING_1]);
    expect(room(state, ROOM_B).bookings).toEqual([]);
  });

  it("confirms an existing hold in place", () => {
    const held = apply(initial(), bookingEvent());
    const confirmed = apply(
      held,
      bookingEvent({ type: "booking.confirmed", status: "confirmed", holdExpiresAt: null }),
    );
    const bookings = room(confirmed, ROOM_B).bookings;
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ id: BOOKING_2, status: "confirmed", holdExpiresAt: null });
  });

  it("adds a confirmed booking it never saw as a hold (missed event)", () => {
    const state = apply(initial(), bookingEvent({ type: "booking.confirmed", status: "confirmed", holdExpiresAt: null }));
    expect(room(state, ROOM_B).bookings[0]?.status).toBe("confirmed");
  });

  it.each([
    ["booking.cancelled", "cancelled"],
    ["booking.expired", "expired"],
  ] as const)("removes the booking on %s", (type, status) => {
    const held = apply(initial(), bookingEvent());
    const released = apply(held, bookingEvent({ type, status, holdExpiresAt: null }));
    expect(room(released, ROOM_B).bookings).toEqual([]);
  });

  it("ignores the release of a booking it never had", () => {
    const before = initial();
    const after = apply(before, bookingEvent({ type: "booking.cancelled", status: "cancelled", holdExpiresAt: null }));
    expect(after).toBe(before);
  });

  it("marks a stay as completed", () => {
    const state = apply(
      initial(),
      bookingEvent({ roomId: ROOM_A, id: BOOKING_1, type: "booking.completed", status: "completed", start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z", holdExpiresAt: null }),
    );
    expect(room(state, ROOM_A).bookings[0]?.status).toBe("completed");
  });

  it("never moves a booking backwards (late hold_created after confirmed)", () => {
    const confirmed = apply(initial(), bookingEvent({ type: "booking.confirmed", status: "confirmed", holdExpiresAt: null }));
    const late = apply(confirmed, bookingEvent({ type: "booking.hold_created", status: "pending" }));
    expect(late).toBe(confirmed);
    expect(room(late, ROOM_B).bookings[0]?.status).toBe("confirmed");
  });

  it("is idempotent for duplicate deliveries", () => {
    const once = apply(initial(), bookingEvent());
    expect(apply(once, bookingEvent())).toBe(once);
  });

  it("ignores bookings that do not overlap the visible day", () => {
    const before = initial();
    const nextDay = bookingEvent({ start: "2026-10-14T10:00:00Z", end: "2026-10-14T11:00:00Z" });
    expect(apply(before, nextDay)).toBe(before);
  });

  it("keeps a booking that straddles the window edge", () => {
    const state = apply(initial(), bookingEvent({ start: "2026-10-13T23:30:00Z", end: "2026-10-14T00:30:00Z" }));
    expect(room(state, ROOM_B).bookings).toHaveLength(1);
  });

  it("drops a booking whose range moved outside the window", () => {
    const held = apply(initial(), bookingEvent());
    const moved = apply(held, bookingEvent({ start: "2026-10-15T10:00:00Z", end: "2026-10-15T11:00:00Z" }));
    expect(room(moved, ROOM_B).bookings).toEqual([]);
  });

  it("ignores events for unknown rooms", () => {
    const before = initial();
    expect(apply(before, bookingEvent({ roomId: "ghost-room" }))).toBe(before);
  });

  it("leaves unrelated rooms untouched by reference", () => {
    const before = initial();
    const after = apply(before, bookingEvent());
    expect(room(after, ROOM_A)).toBe(room(before, ROOM_A));
  });
});

describe("connection-level events", () => {
  it.each<LiveEvent>([{ kind: "connected" }, { kind: "resync" }])("%j does not touch data", (event) => {
    const before = initial();
    expect(apply(before, event)).toBe(before);
  });
});
