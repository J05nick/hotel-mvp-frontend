import Link from "next/link";

import { formatDateKey, shiftDateKey } from "@/shared/lib/zoned-time";

const LINK =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";

type DayNavigationProps = {
  dateKey: string;
  isToday: boolean;
};

export function DayNavigation({ dateKey, isToday }: DayNavigationProps) {
  return (
    <nav aria-label="Day navigation" className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold" data-testid="day-title">
        {formatDateKey(dateKey)}
        {isToday && (
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 align-middle text-xs font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            Today
          </span>
        )}
      </h2>
      <div className="flex gap-2">
        <Link className={LINK} href={`/?date=${shiftDateKey(dateKey, -1)}`} prefetch={false}>
          ← Previous day
        </Link>
        <Link className={LINK} href="/" prefetch={false}>
          Today
        </Link>
        <Link className={LINK} href={`/?date=${shiftDateKey(dateKey, 1)}`} prefetch={false}>
          Next day →
        </Link>
      </div>
    </nav>
  );
}
