/** Static fallback shown while the Server Component reads the calendar. */
export function CalendarSkeleton() {
  return (
    <div role="status" aria-label="Loading calendar" className="flex animate-pulse flex-col gap-4">
      <div className="h-8 w-72 rounded-md bg-slate-200 dark:bg-slate-800" />
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        {Array.from({ length: 4 }, (_, row) => (
          <div
            key={row}
            className="grid grid-cols-[13rem_1fr] border-b border-slate-100 last:border-b-0 dark:border-slate-800"
          >
            <div className="m-4 h-14 rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="m-4 h-10 rounded-md bg-slate-100 dark:bg-slate-900" />
          </div>
        ))}
      </div>
    </div>
  );
}
