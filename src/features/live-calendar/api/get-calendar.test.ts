import { describe, expect, it, vi } from "vitest";

import { BOOKING_1, ROOM_A, ROOM_B, makeCalendarDto } from "@tests/fixtures";

import { getCalendarSnapshot } from "./get-calendar";

describe("getCalendarSnapshot", () => {
  it("asks the API for the window and converts the wire format", async () => {
    const fetchMock = vi.fn(async () => Response.json(makeCalendarDto()));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getCalendarSnapshot({
      baseUrl: "http://api:8000",
      start: new Date("2026-10-13T05:00:00Z"),
      end: new Date("2026-10-14T05:00:00Z"),
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("http://api:8000/api/v1/calendar");
    expect(parsed.searchParams.get("from")).toBe("2026-10-13T05:00:00.000Z");
    expect(parsed.searchParams.get("to")).toBe("2026-10-14T05:00:00.000Z");

    expect(snapshot.generatedAt).toBe("2026-10-13T08:00:00.123456Z");
    expect(snapshot.rooms.map((r) => r.id)).toEqual([ROOM_A, ROOM_B]);
    expect(snapshot.rooms[0]).toMatchObject({
      number: "101",
      pricePerBlockCents: 1500,
      status: "available",
      bookings: [{ id: BOOKING_1, status: "confirmed", holdExpiresAt: null }],
    });
  });

  it("rejects a response that breaks the contract", async () => {
    const broken = { ...makeCalendarDto(), rooms: [{ id: "x" }] };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(broken)));
    await expect(
      getCalendarSnapshot({ baseUrl: "http://api", start: new Date(0), end: new Date(1) }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
