"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Older than this and the page fetches itself again when it opens. */
const STALE_MS = 15_000;

/**
 * The home page loads its activity cards' pages ahead (D893), and Next keeps a page loaded that
 * way for five minutes. Seats taken and statuses change in that time, so an activity page that
 * was drawn more than a few seconds before it opened quietly fetches itself again. The swap is an
 * update, not a new page, so it does not animate (D891).
 *
 * A phone whose clock runs fast only refetches more often than it needs to; one whose clock runs
 * slow can show a page up to those five minutes old, which every action still checks on the
 * server.
 */
export function FreshOnArrival({ renderedAt }: { renderedAt: number }) {
  const router = useRouter();
  useEffect(() => {
    if (Date.now() - renderedAt > STALE_MS) router.refresh();
  }, [renderedAt, router]);
  return null;
}
