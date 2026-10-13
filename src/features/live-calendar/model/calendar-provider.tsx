"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import { useWebSocket, type SocketStatus } from "@/shared/lib/use-websocket";

import { calendarReducer, createCalendarState, type CalendarState } from "./calendar-state";
import { parseLiveEvent } from "./live-events";
import type { CalendarSnapshot } from "./snapshot";

/**
 * Two contexts on purpose: connection flaps must not re-render the whole board, and room
 * updates must not re-render the connection badge.
 */
const CalendarContext = createContext<CalendarState | null>(null);
const ConnectionContext = createContext<SocketStatus | null>(null);

type CalendarProviderProps = {
  /** Snapshot read by the Server Component. A newer `generatedAt` replaces local state. */
  initial: CalendarSnapshot;
  /** Browser-reachable WebSocket endpoint (runtime configuration). */
  wsUrl: string;
  children: ReactNode;
};

export function CalendarProvider({ initial, wsUrl, children }: CalendarProviderProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(calendarReducer, initial, createCalendarState);

  // New server snapshot (date navigation or router.refresh): adopt it. Adjusting state while
  // rendering is React's recommended way to derive state from props without an extra effect.
  const [adopted, setAdopted] = useState(initial.generatedAt);
  if (adopted !== initial.generatedAt) {
    setAdopted(initial.generatedAt);
    dispatch({ type: "reset", snapshot: initial });
  }

  // Ask the server for a fresh snapshot (re-runs the Server Component, keeps client state).
  const resync = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const handleMessage = useCallback(
    (raw: string) => {
      const event = parseLiveEvent(raw);
      if (event === null) return; // malformed / unknown: ignore
      if (event.kind === "resync") {
        resync();
        return;
      }
      dispatch({ type: "event", event });
    },
    [resync],
  );

  const handleOpen = useCallback(
    ({ isReconnect }: { isReconnect: boolean }) => {
      // Events published while the socket was down are gone: reload the snapshot.
      if (isReconnect) resync();
    },
    [resync],
  );

  const { status } = useWebSocket({ url: wsUrl, onMessage: handleMessage, onOpen: handleOpen });

  return (
    <ConnectionContext.Provider value={status}>
      <CalendarContext.Provider value={state}>{children}</CalendarContext.Provider>
    </ConnectionContext.Provider>
  );
}

/** Current calendar (snapshot + live changes). Must be used under `CalendarProvider`. */
export function useCalendar(): CalendarState {
  const value = useContext(CalendarContext);
  if (value === null) throw new Error("useCalendar must be used inside <CalendarProvider>");
  return value;
}

/** State of the live connection, for the "Live / Reconnecting" indicator. */
export function useConnectionStatus(): SocketStatus {
  const value = useContext(ConnectionContext);
  if (value === null) {
    throw new Error("useConnectionStatus must be used inside <CalendarProvider>");
  }
  return value;
}
