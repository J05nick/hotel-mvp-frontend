import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarProvider } from "@/features/live-calendar";
import type { CalendarSnapshot } from "@/features/live-calendar";
import { FakeWebSocket } from "@tests/fake-websocket";
import {
  BOOKING_1,
  BOOKING_2,
  ROOM_A,
  ROOM_B,
  bookingMessage,
  makeSnapshot,
  roomStatusMessage,
  systemMessage,
} from "@tests/fixtures";

import { CalendarBoard } from "./calendar-board";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const WS_URL = "ws://api.test/ws/events";

function renderBoard(snapshot: CalendarSnapshot = makeSnapshot()) {
  const tree = (initial: CalendarSnapshot) => (
    <CalendarProvider initial={initial} wsUrl={WS_URL}>
      <CalendarBoard timeZone="UTC" />
    </CalendarProvider>
  );
  const view = render(tree(snapshot));
  return { ...view, update: (next: CalendarSnapshot) => view.rerender(tree(next)) };
}

const socket = () => FakeWebSocket.last;
const open = () => act(() => socket().serverOpens());
const send = (message: unknown) => act(() => socket().serverSends(message));

const row = (roomId: string) => {
  const element = document.querySelector<HTMLElement>(`[data-room-id="${roomId}"]`);
  if (!element) throw new Error(`row ${roomId} not rendered`);
  return element;
};
const count = (status: string) =>
  document.querySelector(`[data-count-for="${status}"] strong`)?.textContent;
const connection = () => screen.getByRole("status", { name: "" }).getAttribute("data-connection");

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.reset();
  refresh.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("initial render (server snapshot)", () => {
  it("shows every room with its status and bookings before any socket message", () => {
    renderBoard();

    expect(within(row(ROOM_A)).getByText("101")).toBeInTheDocument();
    expect(within(row(ROOM_A)).getByText("Available")).toBeInTheDocument();
    expect(within(row(ROOM_B)).getByText("Cleaning")).toBeInTheDocument();
    expect(within(row(ROOM_A)).getByRole("listitem", { name: "Confirmed 10:00–11:00" })).toBeInTheDocument();
    expect(count("available")).toBe("1");
    expect(count("cleaning")).toBe("1");
    expect(count("occupied")).toBe("0");
  });

  it("explains an empty hotel", () => {
    renderBoard(makeSnapshot({ rooms: [] }));
    expect(screen.getByText("No rooms yet.")).toBeInTheDocument();
  });

  it("opens exactly one socket to the configured url", () => {
    renderBoard();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket().url).toBe(WS_URL);
  });
});

describe("live updates", () => {
  it("flips a room's status badge and the summary when a room event arrives", () => {
    renderBoard();
    open();
    expect(within(row(ROOM_B)).getByText("Cleaning")).toBeInTheDocument();

    send(roomStatusMessage(ROOM_B, "available", "cleaning"));

    expect(row(ROOM_B)).toHaveAttribute("data-room-status", "available");
    expect(within(row(ROOM_B)).getByText("Available")).toBeInTheDocument();
    expect(count("available")).toBe("2");
    expect(count("cleaning")).toBe("0");
  });

  it("follows the whole life of a stay: hold, confirm, complete, cleaning, available", () => {
    renderBoard();
    open();
    const booking = { roomId: ROOM_B, bookingId: BOOKING_2 };

    send(bookingMessage({ ...booking, type: "booking.hold_created", status: "pending", holdExpiresAt: "2099-01-01T00:00:00Z" }));
    expect(within(row(ROOM_B)).getByRole("listitem", { name: "On hold 12:00–13:00" })).toBeInTheDocument();

    send(bookingMessage({ ...booking, type: "booking.confirmed", status: "confirmed" }));
    expect(within(row(ROOM_B)).getByRole("listitem", { name: "Confirmed 12:00–13:00" })).toBeInTheDocument();
    expect(within(row(ROOM_B)).getAllByRole("listitem")).toHaveLength(1); // updated, not duplicated

    send(bookingMessage({ ...booking, type: "booking.completed", status: "completed" }));
    expect(within(row(ROOM_B)).getByRole("listitem", { name: "Completed 12:00–13:00" })).toBeInTheDocument();

    send(roomStatusMessage(ROOM_B, "cleaning", "available"));
    send(roomStatusMessage(ROOM_B, "available", "cleaning", "2026-10-13T09:00:00Z"));
    expect(row(ROOM_B)).toHaveAttribute("data-room-status", "available");
  });

  it("removes a booking when it is cancelled or expires", () => {
    renderBoard();
    open();
    expect(within(row(ROOM_A)).getAllByRole("listitem")).toHaveLength(1);

    send(bookingMessage({ type: "booking.cancelled", roomId: ROOM_A, bookingId: BOOKING_1, status: "cancelled", start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z" }));

    expect(within(row(ROOM_A)).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("positions blocks proportionally on the day", () => {
    renderBoard();
    const block = within(row(ROOM_A)).getByRole("listitem");
    // 10:00-11:00 of a 24h day: starts at 41.666...%, lasts 4.1666...%
    expect(parseFloat(block.style.left)).toBeCloseTo(41.667, 2);
    expect(parseFloat(block.style.width)).toBeCloseTo(4.167, 2);
  });

  it("ignores malformed frames, unknown rooms and unknown event types", () => {
    renderBoard();
    open();
    const before = document.body.innerHTML;

    send("{not json");
    send({ v: 1, type: "booking.teleported", occurred_at: "2026-10-13T08:05:00Z", room_id: ROOM_A, data: {} });
    send(roomStatusMessage("ghost-room", "occupied", null));
    send(systemMessage("system.connected"));

    expect(document.body.innerHTML).toBe(before);
  });

  it("does not re-render rooms that did not change", () => {
    renderBoard();
    open();
    const untouched = row(ROOM_A);

    send(roomStatusMessage(ROOM_B, "occupied", "cleaning"));

    expect(row(ROOM_A)).toBe(untouched); // same DOM node: React kept it
  });
});

describe("connection indicator and resynchronisation", () => {
  it("walks through connecting -> live -> reconnecting -> live", () => {
    vi.useFakeTimers();
    renderBoard();
    expect(screen.getByText("Connecting…")).toBeInTheDocument();

    open();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(connection()).toBe("open");

    act(() => socket().serverDrops());
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(20_000));
    open();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("reloads the snapshot after a reconnection, but not on the first connection", () => {
    vi.useFakeTimers();
    renderBoard();
    open();
    expect(refresh).not.toHaveBeenCalled();

    act(() => socket().serverDrops());
    act(() => vi.advanceTimersByTime(20_000));
    open();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reloads the snapshot when the server announces lost events (system.resync)", () => {
    renderBoard();
    open();
    send(systemMessage("system.resync"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("adopts a newer server snapshot and discards stale local state", () => {
    const { update } = renderBoard();
    open();
    send(roomStatusMessage(ROOM_B, "occupied", "cleaning"));
    expect(within(row(ROOM_B)).getByText("Occupied")).toBeInTheDocument();

    update(
      makeSnapshot({
        generatedAt: "2026-10-13T09:00:00Z",
        rooms: makeSnapshot().rooms.map((room) =>
          room.id === ROOM_B ? { ...room, status: "maintenance" as const } : room,
        ),
      }),
    );

    expect(within(row(ROOM_B)).getByText("Maintenance")).toBeInTheDocument();
    expect(FakeWebSocket.instances).toHaveLength(1); // the socket survived the snapshot swap
  });

  it("keeps local state when the same snapshot is re-rendered", () => {
    const snapshot = makeSnapshot();
    const { update } = renderBoard(snapshot);
    open();
    send(roomStatusMessage(ROOM_B, "occupied", "cleaning"));

    update(snapshot);

    expect(within(row(ROOM_B)).getByText("Occupied")).toBeInTheDocument();
  });

  it("closes the socket when the board unmounts", () => {
    const { unmount } = renderBoard();
    open();
    const live = socket();
    unmount();
    expect(live.closeCalls).toBe(1);
  });
});

describe("holds and the current time", () => {
  it("hides a hold whose deadline passed and draws the 'now' marker", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-13T10:10:00Z"));
    const snapshot = makeSnapshot();
    const room = snapshot.rooms[1]!;
    room.bookings = [
      { id: "lapsed", status: "pending", start: "2026-10-13T12:00:00Z", end: "2026-10-13T12:30:00Z", holdExpiresAt: "2026-10-13T10:05:00Z" },
      { id: "alive", status: "pending", start: "2026-10-13T13:00:00Z", end: "2026-10-13T13:30:00Z", holdExpiresAt: "2026-10-13T10:15:00Z" },
    ];

    renderBoard(snapshot);

    const blocks = within(row(ROOM_B)).getAllByRole("listitem");
    expect(blocks.map((block) => block.getAttribute("data-booking-id"))).toEqual(["alive"]);
    expect(screen.getAllByTestId("now-marker")).toHaveLength(2); // one per room row
  });
});
