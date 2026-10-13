"use client";

import { useSyncExternalStore } from "react";

/**
 * Ticking clock that is `null` during SSR and the first hydration pass, so server and client
 * markup always match; it becomes a real timestamp right after mount.
 * Every subscriber of the same `intervalMs` shares one timer.
 */
type Clock = {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  /** Stable identity: `useSyncExternalStore` re-subscribes whenever this function changes. */
  subscribe: (listener: () => void) => () => void;
};

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  const existing = clocks.get(intervalMs);
  if (existing) return existing;

  const clock: Clock = {
    now: Date.now(),
    listeners: new Set(),
    timer: null,
    subscribe(listener) {
      if (clock.listeners.size === 0) clock.now = Date.now(); // idle clock may be stale
      clock.listeners.add(listener);
      clock.timer ??= setInterval(() => {
        clock.now = Date.now();
        clock.listeners.forEach((notify) => notify());
      }, intervalMs);
      return () => {
        clock.listeners.delete(listener);
        if (clock.listeners.size === 0 && clock.timer !== null) {
          clearInterval(clock.timer);
          clock.timer = null;
        }
      };
    },
  };
  clocks.set(intervalMs, clock);
  return clock;
}

export function useNow(intervalMs = 30_000): number | null {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(
    clock.subscribe,
    () => clock.now,
    () => null,
  );
}
