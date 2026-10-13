import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeWebSocket } from "@tests/fake-websocket";

import { useWebSocket, type UseWebSocketOptions } from "./use-websocket";

const URL_A = "ws://api.test/ws/events";

function setup(options: Partial<UseWebSocketOptions> = {}) {
  const onMessage = vi.fn<(data: string) => void>();
  const onOpen = vi.fn<(info: { isReconnect: boolean }) => void>();
  const hook = renderHook(
    (props: Partial<UseWebSocketOptions>) =>
      useWebSocket({ url: URL_A, onMessage, onOpen, ...options, ...props }),
    { initialProps: {} as Partial<UseWebSocketOptions> },
  );
  return { ...hook, onMessage, onOpen };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.spyOn(Math, "random").mockReturnValue(1); // no jitter: delay == the backoff ceiling
  FakeWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWebSocket", () => {
  it("connects, reports status and delivers text frames", () => {
    const { result, onMessage } = setup();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.last.url).toBe(URL_A);
    expect(result.current.status).toBe("connecting");

    act(() => FakeWebSocket.last.serverOpens());
    expect(result.current.status).toBe("open");

    act(() => FakeWebSocket.last.serverSends("hello"));
    expect(onMessage).toHaveBeenCalledExactlyOnceWith("hello");
  });

  it("ignores non-text frames", () => {
    const { onMessage } = setup();
    act(() => FakeWebSocket.last.serverOpens());
    act(() => {
      FakeWebSocket.last.onmessage?.(new MessageEvent("message", { data: new ArrayBuffer(4) }));
    });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("uses the latest handler without reconnecting", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = setup({ onMessage: first });
    act(() => FakeWebSocket.last.serverOpens());

    rerender({ onMessage: second });
    act(() => FakeWebSocket.last.serverSends("x"));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("x");
  });

  it("reconnects with exponential backoff, capped, and resets after a success", () => {
    const { result } = setup({ baseDelayMs: 500, maxDelayMs: 2_000 });
    act(() => FakeWebSocket.last.serverOpens());

    const dropAndWait = (delayMs: number) => {
      act(() => FakeWebSocket.last.serverDrops());
      expect(result.current.status).toBe("reconnecting");
      const before = FakeWebSocket.instances.length;
      act(() => vi.advanceTimersByTime(delayMs - 1));
      expect(FakeWebSocket.instances).toHaveLength(before); // not yet
      act(() => vi.advanceTimersByTime(1));
      expect(FakeWebSocket.instances).toHaveLength(before + 1);
    };

    dropAndWait(500); // attempt 0
    dropAndWait(1_000); // attempt 1 (never opened in between)
    dropAndWait(2_000); // attempt 2 -> 2000
    dropAndWait(2_000); // capped at maxDelayMs

    act(() => FakeWebSocket.last.serverOpens()); // success resets the counter
    dropAndWait(500);
  });

  it("applies jitter so clients do not retry in lockstep", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // minimum jitter: half the ceiling
    setup({ baseDelayMs: 1_000 });
    act(() => FakeWebSocket.last.serverOpens());
    act(() => FakeWebSocket.last.serverDrops());

    act(() => vi.advanceTimersByTime(499));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("flags reconnections so callers can resynchronise", () => {
    const { onOpen, result } = setup();
    act(() => FakeWebSocket.last.serverOpens());
    expect(onOpen).toHaveBeenLastCalledWith({ isReconnect: false });

    act(() => FakeWebSocket.last.serverDrops());
    act(() => vi.advanceTimersByTime(10_000));
    act(() => FakeWebSocket.last.serverOpens());

    expect(onOpen).toHaveBeenLastCalledWith({ isReconnect: true });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("open");
  });

  it("keeps reporting 'connecting' while the very first connection keeps failing", () => {
    const { result, onOpen } = setup();
    act(() => FakeWebSocket.last.serverDrops());
    expect(result.current.status).toBe("connecting");
    act(() => vi.advanceTimersByTime(10_000));
    act(() => FakeWebSocket.last.serverOpens());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({ isReconnect: false });
  });

  it("closes the socket and cancels pending retries on unmount", () => {
    const { unmount } = setup();
    act(() => FakeWebSocket.last.serverOpens());
    const socket = FakeWebSocket.last;
    unmount();
    expect(socket.closeCalls).toBe(1);
    expect(socket.onmessage).toBeNull();

    // A retry scheduled before unmounting must not fire afterwards.
    const second = setup();
    act(() => FakeWebSocket.last.serverOpens());
    act(() => FakeWebSocket.last.serverDrops());
    const count = FakeWebSocket.instances.length;
    second.unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(count);
  });

  it("does not reconnect after an intentional close during teardown", () => {
    const { unmount } = setup();
    act(() => FakeWebSocket.last.serverOpens());
    unmount();
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("switches sockets when the url changes", () => {
    const { result, rerender } = setup();
    act(() => FakeWebSocket.last.serverOpens());
    const old = FakeWebSocket.last;

    rerender({ url: "ws://other.test/ws/events" });

    expect(old.closeCalls).toBe(1);
    expect(FakeWebSocket.last.url).toBe("ws://other.test/ws/events");
    expect(result.current.status).toBe("connecting");
  });

  it("stays closed while disabled", () => {
    const { result, rerender } = setup({ enabled: false });
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(result.current.status).toBe("closed");

    rerender({ enabled: true });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe("connecting");
  });

  it("reconnects immediately when the browser comes back online", () => {
    setup({ baseDelayMs: 60_000 });
    act(() => FakeWebSocket.last.serverOpens());
    act(() => FakeWebSocket.last.serverDrops());
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    // ...and the stale retry timer was cancelled, so it does not create a third socket.
    act(() => vi.advanceTimersByTime(120_000));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("ignores 'online' while a connection is open or being established", () => {
    setup();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(FakeWebSocket.instances).toHaveLength(1); // still CONNECTING
    act(() => FakeWebSocket.last.serverOpens());
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
