"use client";

import { useEffect } from "react";

export default function CalendarError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">The calendar is not available</h1>
      <p className="text-slate-600 dark:text-slate-400">
        We could not load the rooms right now. The booking service may be restarting; this page
        will work again as soon as it is back.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Try again
      </button>
    </main>
  );
}
