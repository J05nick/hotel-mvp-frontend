import { Suspense } from "react";

import { CalendarSkeleton, CalendarView } from "@/views/calendar";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6">
      {/* Static shell: prerendered and sent immediately. */}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Room calendar</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Bookings are sold in 30-minute blocks. Changes appear here the moment they happen.
        </p>
      </header>

      {/* Request-time content (query string, env, clock, API) streams in behind a fallback. */}
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarView searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
