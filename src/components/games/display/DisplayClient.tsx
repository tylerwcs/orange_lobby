"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DisplayState } from "@/lib/games/wire";
import { displayInterval } from "@/lib/games/poll";
import { usePoll } from "../usePoll";
import { IdleScreen } from "./IdleScreen";
import { RaceScreen } from "./RaceScreen";
import { SurvivalScreen } from "./SurvivalScreen";

const displayEvery = (s: DisplayState) => displayInterval(s.stage.phase);

const onResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const fitScale = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080);

/** Everything is laid out on a fixed 1920×1080 canvas (D284) and scaled to whatever the screen is. */
function Canvas1080({ children }: { children: React.ReactNode }) {
  const scale = useSyncExternalStore(onResize, fitScale, () => 1);
  return (
    <div className="absolute left-1/2 top-1/2 h-[1080px] w-[1920px]" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      {children}
    </div>
  );
}

/** Keeps the screen from sleeping (D284). Browsers drop the lock when the tab hides, so it is re-taken on return. */
function useWakeLock(active: boolean) {
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

/**
 * The LED page (D251). It opens on "Click to start display" because browsers allow fullscreen
 * and a wake lock only after a click (D284). It polls the full view (D260): four times a second
 * during a race, once a second otherwise. A reload redraws straight from the stage (D262).
 */
export function DisplayClient({ token, initial }: { token: string; initial: DisplayState }) {
  const { state, offset } = usePoll<DisplayState>(`/api/display/${token}/state`, initial, displayEvery, false);
  const [started, setStarted] = useState(false);
  useWakeLock(started);

  const start = () => {
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black text-white" style={{ "--brand": state.event.colour } as React.CSSProperties}>
      <Canvas1080>
        <Screen state={state} offset={offset} />
      </Canvas1080>
      {!started && (
        <button type="button" onClick={start}
          className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/85">
          <span className="text-5xl font-extrabold">Click to start display</span>
          <span className="text-xl opacity-70">Goes full screen and keeps the screen awake.</span>
        </button>
      )}
    </div>
  );
}

/** Which screen the stage calls for. Task 18 adds the lucky draw here. */
function Screen({ state, offset }: { state: DisplayState; offset: number }) {
  const kind = state.stage.game?.kind;
  if (kind === "tap_race" && state.race) return <RaceScreen state={state} offset={offset} />;
  if (kind === "survival" && state.survival) return <SurvivalScreen state={state} offset={offset} />;
  return <IdleScreen event={state.event} />;
}
