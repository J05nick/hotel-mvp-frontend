import { ROOM_STATUS_LABEL, type RoomStatus } from "../model/room";

const STYLES: Record<RoomStatus, { badge: string; dot: string }> = {
  available: {
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30",
    dot: "bg-emerald-500",
  },
  occupied: {
    badge: "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-400/30",
    dot: "bg-rose-500",
  },
  cleaning: {
    badge: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-400/30",
    dot: "bg-sky-500",
  },
  maintenance: {
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/30",
    dot: "bg-slate-400",
  },
};

/** Status is always conveyed by text as well as colour. */
export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const style = STYLES[status];
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
      {ROOM_STATUS_LABEL[status]}
    </span>
  );
}
