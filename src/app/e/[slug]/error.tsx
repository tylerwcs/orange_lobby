"use client";

import { useEffect } from "react";

// Next 16 passes `retry()` (re-fetches the segment); `reset()` is the older, non-refetching escape hatch.
export default function EventError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <div className="w-full rounded-lg border bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-orange-600">Orange Lobby</h1>
        <p className="mt-3 text-gray-700">Something went wrong. Please try again.</p>
        <button onClick={() => (retry ?? reset)?.()} className="mt-4 rounded bg-orange-600 px-4 py-2 text-sm text-white">
          Retry
        </button>
      </div>
    </main>
  );
}
