"use client";

import { useConnectionStatus } from "@/features/live-calendar";
import type { SocketStatus } from "@/shared/lib/use-websocket";

const PRESENTATION: Record<SocketStatus, { label: string; dot: string; text: string }> = {
  open: { label: "Live", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  connecting: { label: "Connecting…", dot: "bg-amber-500 animate-pulse", text: "text-amber-700 dark:text-amber-300" },
  reconnecting: { label: "Reconnecting…", dot: "bg-amber-500 animate-pulse", text: "text-amber-700 dark:text-amber-300" },
  closed: { label: "Offline", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-400" },
};

/** Tells the user whether what they see is being updated in real time. */
export function ConnectionBadge() {
  const status = useConnectionStatus();
  const { label, dot, text } = PRESENTATION[status];
  return (
    <span
      role="status"
      data-connection={status}
      className={`inline-flex items-center gap-2 text-sm font-medium ${text}`}
    >
      <span aria-hidden className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
