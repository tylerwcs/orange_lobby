"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered page current while someone watches it.
 *
 * This polls — it re-runs the server render on an interval — rather than subscribing to
 * database changes. For one organiser watching a door for half an hour that is the right
 * trade: no client-side Supabase session, no second source of truth, and the numbers stay
 * derived by the same code that renders them on a cold load.
 *
 * It stops while the tab is hidden, so a dashboard left open on a spare laptop overnight
 * is not re-querying every few seconds, and refreshes once on return so the first glance
 * is never stale.
 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(true);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    };
    const onVisibility = () => {
      setLive(document.visibilityState === "visible");
      refreshIfVisible();
    };
    const id = setInterval(refreshIfVisible, seconds * 1000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ok-strong"
      title={`Refreshes every ${seconds} seconds while this tab is open`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-ok ${live ? "animate-pulse" : ""}`} />
      {live ? "Live" : "Paused"}
    </span>
  );
}
