import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "./use-now";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("renders null on the server so hydration matches, then the real time", () => {
    function Probe() {
      return <span>{String(useNow(1_000))}</span>;
    }
    expect(renderToString(<Probe />)).toContain("null");

    const { result } = renderHook(() => useNow(1_000));
    expect(result.current).toBe(Date.parse("2026-10-13T10:00:00Z"));
  });

  it("ticks on the interval", () => {
    const { result } = renderHook(() => useNow(1_000));
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBe(Date.parse("2026-10-13T10:00:03Z"));
  });

  it("does not loop or re-render without a tick (stable subscription)", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useNow(1_000);
    });
    const afterMount = renders;
    expect(afterMount).toBeLessThan(5);
    act(() => vi.advanceTimersByTime(500)); // no tick yet
    expect(renders).toBe(afterMount);
  });

  it("shares one timer between consumers and stops it when the last one leaves", () => {
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const a = renderHook(() => useNow(7_000));
    const b = renderHook(() => useNow(7_000));
    expect(setSpy.mock.calls.filter(([, ms]) => ms === 7_000)).toHaveLength(1);

    a.unmount();
    expect(clearSpy).not.toHaveBeenCalled();
    b.unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("refreshes a clock that sat idle before the next subscriber arrives", () => {
    renderHook(() => useNow(9_000)).unmount();
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    const { result } = renderHook(() => useNow(9_000));
    expect(result.current).toBe(Date.parse("2026-10-13T12:00:00Z"));
  });
});
