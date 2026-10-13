import { describe, expect, it } from "vitest";

import {
  BOOKING_1,
  ROOM_A,
  bookingMessage,
  roomStatusMessage,
  systemMessage,
} from "@tests/fixtures";

import { parseLiveEvent } from "./live-events";

const parse = (message: unknown) => parseLiveEvent(JSON.stringify(message));

describe("parseLiveEvent", () => {
  it.each([
    ["booking.hold_created", "pending"],
    ["booking.confirmed", "confirmed"],
    ["booking.cancelled", "cancelled"],
    ["booking.completed", "completed"],
    ["booking.expired", "expired"],
  ])("parses %s", (type, status) => {
    const event = parse(
      bookingMessage({ type, roomId: ROOM_A, bookingId: BOOKING_1, status }),
    );
    expect(event).toEqual({
      kind: "booking",
      type,
      occurredAt: "2026-10-13T08:05:00Z",
      roomId: ROOM_A,
      booking: {
        id: BOOKING_1,
        status,
        start: "2026-10-13T12:00:00Z",
        end: "2026-10-13T13:00:00Z",
        holdExpiresAt: null,
      },
    });
  });

  it("keeps the hold deadline of a pending booking", () => {
    const event = parse(
      bookingMessage({
        type: "booking.hold_created",
        roomId: ROOM_A,
        status: "pending",
        holdExpiresAt: "2026-10-13T08:10:00Z",
      }),
    );
    expect(event).toMatchObject({ booking: { holdExpiresAt: "2026-10-13T08:10:00Z" } });
  });

  it("parses room status changes, with and without a previous status", () => {
    expect(parse(roomStatusMessage(ROOM_A, "cleaning", "available"))).toEqual({
      kind: "room-status",
      occurredAt: "2026-10-13T08:05:00Z",
      roomId: ROOM_A,
      status: "cleaning",
      previousStatus: "available",
    });
    expect(parse(roomStatusMessage(ROOM_A, "available", null))).toMatchObject({
      previousStatus: null,
    });
  });

  it("parses system messages", () => {
    expect(parse(systemMessage("system.connected"))).toEqual({ kind: "connected" });
    expect(parse(systemMessage("system.resync"))).toEqual({ kind: "resync" });
  });

  it("accepts the backend's microsecond timestamps and numeric offsets", () => {
    const event = parse({
      ...roomStatusMessage(ROOM_A, "available", "cleaning"),
      occurred_at: "2026-10-13T08:05:00.123456+00:00",
    });
    expect(event).toMatchObject({ kind: "room-status", occurredAt: "2026-10-13T08:05:00.123456+00:00" });
  });

  it("ignores fields it does not know (forward compatible)", () => {
    const message = { ...roomStatusMessage(ROOM_A, "cleaning", null), extra: { anything: 1 } };
    expect(parse(message)).toMatchObject({ kind: "room-status" });
  });

  it.each([
    ["not json", "{oops"],
    ["empty", ""],
    ["a JSON primitive", "42"],
    ["null", "null"],
    ["unknown type", JSON.stringify({ ...systemMessage("system.connected"), type: "booking.teleported" })],
    ["future envelope version", JSON.stringify({ ...systemMessage("system.connected"), v: 2 })],
    ["unknown booking status", JSON.stringify(bookingMessage({ type: "booking.confirmed", roomId: ROOM_A, status: "vip" }))],
    ["unknown room status", JSON.stringify(roomStatusMessage(ROOM_A, "haunted", null))],
    ["bad timestamp", JSON.stringify({ ...roomStatusMessage(ROOM_A, "cleaning", null), occurred_at: "yesterday" })],
    ["missing data", JSON.stringify({ v: 1, type: "booking.confirmed", occurred_at: "2026-10-13T08:05:00Z", room_id: ROOM_A })],
  ])("returns null for %s", (_label, raw) => {
    expect(parseLiveEvent(raw)).toBeNull();
  });

  it("drops room-scoped events that carry no room", () => {
    const booking = { ...bookingMessage({ type: "booking.confirmed", roomId: ROOM_A }), room_id: null };
    const room = { ...roomStatusMessage(ROOM_A, "cleaning", null), room_id: null };
    expect(parse(booking)).toBeNull();
    expect(parse(room)).toBeNull();
  });
});
