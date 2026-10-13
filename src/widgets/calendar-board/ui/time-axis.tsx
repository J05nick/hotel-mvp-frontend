import type { Tick } from "../lib/timeline";

export function TimeAxis({ ticks }: { ticks: Tick[] }) {
  return (
    <div className="grid grid-cols-[13rem_1fr] border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      <div className="sticky left-0 z-10 bg-slate-50 px-4 py-2 font-medium dark:bg-slate-900">Room</div>
      <div aria-hidden className="relative h-8">
        {ticks.map((tick) => (
          <span
            key={tick.offsetPct}
            className="absolute top-2 pl-1.5 tabular-nums"
            style={{ left: `${tick.offsetPct}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
