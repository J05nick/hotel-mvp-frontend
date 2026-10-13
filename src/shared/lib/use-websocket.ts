"use client";

import { useEffect, useRef, useState } from "react";

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export type UseWebSocketOptions = {
  url: string;
  /** Called with every text frame. May change identity between renders without reconnecting. */
  onMessage: (data: string) => void;
  /**
   * Called each time the socket opens. `isReconnect` is true from the second open on:
   * frames sent while the socket was down are lost, so callers should resynchronise.
   */
  onOpen?: (info: { isReconnect: boolean }) => void;
  /** `false` keeps the socket closed (useful for tests or feature flags). */
  enabled?: boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

type SocketState = { url: string; status: Exclude<SocketStatus, "closed"> };

/**
 * Browser WebSocket with automatic reconnection.
 *
 * - Exponential backoff (`baseDelayMs * 2^attempt`, capped at `maxDelayMs`) with jitter, so a
 *   restarted server is not hit by every client at the same instant.
 * - Reconnects immediately when the browser goes back online.
 * - Handlers are read through refs: passing inline callbacks never tears the socket down.
 * - Unmounting (or changing `url` / `enabled`) closes the socket and cancels pending retries.
 */
export function useWebSocket({
  url,
  onMessage,
  onOpen,
  enabled = true,
  baseDelayMs = 500,
  maxDelayMs = 15_000,
}: UseWebSocketOptions): { status: SocketStatus } {
  const [state, setState] = useState<SocketState>({ url, status: "connecting" });

  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    if (!enabled) return;

    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let hasOpened = false;
    let disposed = false;

    const connect = () => {
      retryTimer = undefined;
      const current = new WebSocket(url);
      socket = current;

      current.onopen = () => {
        const isReconnect = hasOpened;
        hasOpened = true;
        attempt = 0;
        setState({ url, status: "open" });
        onOpenRef.current?.({ isReconnect });
      };
      current.onmessage = (event: MessageEvent) => {
        if (typeof event.data === "string") onMessageRef.current(event.data);
      };
      current.onclose = () => {
        if (disposed) return;
        setState({ url, status: hasOpened ? "reconnecting" : "connecting" });
        const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, ceiling * (0.5 + Math.random() / 2));
      };
      // `error` is always followed by `close`, which owns the retry logic.
      current.onerror = () => undefined;
    };

    const reconnectNow = () => {
      if (disposed || socket?.readyState === WebSocket.OPEN) return;
      if (socket?.readyState === WebSocket.CONNECTING) return;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      attempt = 0;
      connect();
    };

    connect();
    window.addEventListener("online", reconnectNow);

    return () => {
      disposed = true;
      window.removeEventListener("online", reconnectNow);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
      }
    };
  }, [url, enabled, baseDelayMs, maxDelayMs]);

  // Derived instead of stored: a new URL or a disabled socket never shows stale status.
  const status: SocketStatus = !enabled
    ? "closed"
    : state.url === url
      ? state.status
      : "connecting";
  return { status };
}
