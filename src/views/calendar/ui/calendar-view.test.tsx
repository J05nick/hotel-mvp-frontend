import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/api-client";
import { FakeWebSocket } from "@tests/fake-websocket";
import { ROOM_A, ROOM_B, makeCalendarDto } from "@tests/fixtures";

import { CalendarView } from "./calendar-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const connection = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next/server", () => ({ connection }));

const search = (params: Record<string, string | string[] | undefined> = {}) =>
  Promise.resolve(params);

function stubApi(body: unknown = makeCalendarDto(), status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requestedWindow = (fetchMock: ReturnType<typeof stubApi>) => {
  const [url] = fetchMock.mock.calls[0] as unknown as [string];
  const parsed = new URL(url);
  return {
    path: parsed.origin + parsed.pathname,
    from: parsed.searchParams.get("from"),
    to: parsed.searchParams.get("to"),
  };
};

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.reset();
  connection.mockClear();
  vi.stubEnv("API_BASE_URL", "http://api.internal:8000");
  vi.stubEnv("WS_URL", "wss://hotel.example/ws/events");
  vi.stubEnv("HOTEL_TIMEZONE", "UTC");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T08:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarView (React Server Component)", () => {
  it("fetches today's calendar on the server and renders it without any client round trip", async () => {
    const fetchMock = stubApi();

    render(await CalendarView({ searchParams: search() }));

    expect(connection).toHaveBeenCalled(); // opted into request-time rendering first
    expect(requestedWindow(fetchMock)).toEqual({
      path: "http://api.internal:8000/api/v1/calendar",
      from: "2026-10-13T00:00:00.000Z",
      to: "2026-10-14T00:00:00.000Z",
    });
    // The first paint already has rooms and bookings: no loading state, no extra fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Garden suite")).toBeInTheDocument();
    expect(screen.getByText("Sea view")).toBeInTheDocument();
    const suite = document.querySelector(`[data-room-id="${ROOM_A}"]`) as HTMLElement;
    expect(within(suite).getByRole("listitem", { name: "Confirmed 10:00–11:00" })).toBeInTheDocument();
    expect(document.querySelector(`[data-room-id="${ROOM_B}"]`)).toHaveAttribute("data-room-status", "cleaning");
  });

  it("hands the runtime WebSocket url to the client provider", async () => {
    stubApi();
    render(await CalendarView({ searchParams: search() }));
    expect(FakeWebSocket.last.url).toBe("wss://hotel.example/ws/events");
  });

  it("shows the requested day and links to its neighbours", async () => {
    const fetchMock = stubApi();

    render(await CalendarView({ searchParams: search({ date: "2026-12-31" }) }));

    expect(requestedWindow(fetchMock).from).toBe("2026-12-31T00:00:00.000Z");
    expect(screen.getByTestId("day-title")).toHaveTextContent("Thursday, 31 December 2026");
    expect(within(screen.getByTestId("day-title")).queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /previous day/i })).toHaveAttribute("href", "/?date=2026-12-30");
    expect(screen.getByRole("link", { name: /next day/i })).toHaveAttribute("href", "/?date=2027-01-01");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
  });

  it("marks today with a badge", async () => {
    stubApi();
    render(await CalendarView({ searchParams: search() }));
    expect(within(screen.getByTestId("day-title")).getByText("Today")).toBeInTheDocument();
  });

  it("falls back to today when ?date is not a real date", async () => {
    const fetchMock = stubApi();
    render(await CalendarView({ searchParams: search({ date: "2026-02-30" }) }));
    expect(requestedWindow(fetchMock).from).toBe("2026-10-13T00:00:00.000Z");
  });

  it("defines the day in the hotel's time zone", async () => {
    vi.stubEnv("HOTEL_TIMEZONE", "America/Bogota");
    const fetchMock = stubApi();

    render(await CalendarView({ searchParams: search({ date: "2026-10-13" }) }));

    // Local midnight in Bogota (UTC-5) is 05:00 UTC.
    expect(requestedWindow(fetchMock)).toMatchObject({
      from: "2026-10-13T05:00:00.000Z",
      to: "2026-10-14T05:00:00.000Z",
    });
    // The block 10:00Z-11:00Z is displayed on the hotel's clock: 05:00-06:00.
    expect(screen.getByRole("listitem", { name: "Confirmed 05:00–06:00" })).toBeInTheDocument();
  });

  it("propagates API failures to the route's error boundary", async () => {
    stubApi({ error: "invalid_window", detail: "the window cannot exceed 14 days" }, 422);
    await expect(CalendarView({ searchParams: search() })).rejects.toBeInstanceOf(ApiError);
  });

  it("fails with a readable message when the environment is misconfigured", async () => {
    vi.stubEnv("HOTEL_TIMEZONE", "Mars/Olympus");
    stubApi();
    await expect(CalendarView({ searchParams: search() })).rejects.toThrow(/HOTEL_TIMEZONE/);
  });
});
