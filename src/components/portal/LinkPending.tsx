"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useLinkStatus } from "next/link";

/*
 * What the portal shows between a tap and the next page (D892). Without a loading.tsx the old
 * page stays up while the next one is fetched, so the tap itself has to say it was heard:
 *  - the tapped link stays pressed (`.portal-press` in globals.css, keyed on this marker), and
 *  - a thin bar in the event's colour runs along the top, once the wait passes 150ms (the
 *    delay is in the CSS, so a quick page never shows it at all).
 * A page Next already has (a prefetched activity) skips the pending phase and shows neither.
 */

let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Inside a `<Link>`: marks it pressed while its page is on the way, and lights the bar. */
export function LinkPending() {
  const { pending: isPending } = useLinkStatus();
  useEffect(() => {
    if (!isPending) return;
    pending += 1;
    emit();
    return () => { pending -= 1; emit(); };
  }, [isPending]);
  return <span aria-hidden data-link-pending={isPending ? "" : undefined} className="hidden" />;
}

/** The bar along the top of the screen, once, in the layout. */
export function NavProgressBar() {
  const busy = useSyncExternalStore(subscribe, () => pending > 0, () => false);
  if (!busy) return null;
  return (
    <div aria-hidden className="portal-progress pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden">
      <div className="portal-progress-run h-full w-1/3 rounded-full bg-primary" />
    </div>
  );
}
