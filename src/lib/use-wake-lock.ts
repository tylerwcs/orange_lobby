"use client";
import { useEffect } from "react";

/** Keeps the screen from sleeping (D284). Browsers drop the lock when the tab hides, so it is re-taken on return. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        // Unmounted while the request was in flight: let the lock go rather than hold it forever.
        if (stopped) void next.release();
        else lock = next;
      } catch { /* denied or unsupported: the page still works */ }
    };
    const onVisible = () => { if (!stopped && document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
