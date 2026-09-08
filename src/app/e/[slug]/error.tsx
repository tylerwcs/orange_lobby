"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, Button } from "@/components/ui/Card";

// Next 16 passes `retry()` (re-fetches the segment); `reset()` is the older, non-refetching escape hatch.
export default function EventError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center bg-canvas p-6">
      <Card className="w-full p-6 text-center">
        <Icon name="info" size={28} className="mx-auto text-brand-ink" />
        <h1 className="mt-3 text-lg font-extrabold">Something went wrong.</h1>
        <p className="mt-1 text-sm text-muted">Please try again.</p>
        <Button variant="secondary" className="mt-4" onClick={() => (retry ?? reset)?.()}>
          Retry
        </Button>
      </Card>
    </main>
  );
}
