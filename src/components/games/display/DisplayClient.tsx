"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DisplayState } from "@/lib/games/wire";
import { displayInterval } from "@/lib/games/poll";
import { createSynth, readMuted, writeMuted } from "@/lib/games/sound";
import { usePoll } from "../usePoll";
import { DisplayView } from "./DisplayView";
import { MuteToggle } from "./MuteToggle";

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

const storage = () => { try { return window.localStorage; } catch { return null; } };

/**
 * The LED page around a state (D251, D284, D302): "Click to start display" (fullscreen, wake lock
 * and audio all need a click), the mute switch, and the picture. Used by the live display and by
 * the ?test self-test.
 */
export function DisplayShell({ state, offset }: { state: DisplayState; offset: number }) {
  const [started, setStarted] = useState(false);
  const synth = useMemo(() => createSynth(), []);
  // Lazy initial value only: read once, on mount, so the SSR pass (no localStorage) and the
  // client's first render (real localStorage) never disagree about what gets drawn.
  const [muted, setMuted] = useState(() => readMuted(storage()));
  // The synth is an external system kept in step with React's state (D302), not the other way
  // round — this also carries the initial read above into the synth once it mounts.
  useEffect(() => { synth.setMuted(muted); }, [synth, muted]);
  useWakeLock(started);

  const start = () => {
    setStarted(true);
    synth.unlock();
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const toggle = () => {
    const m = !muted;
    setMuted(m);
    writeMuted(storage(), m);
  };

  return (
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black text-white">
      <Canvas1080><DisplayView state={state} offset={offset} synth={synth} /></Canvas1080>
      {started && <MuteToggle muted={muted} onToggle={toggle} />}
      {!started && (
        <button type="button" onClick={start}
          className="absolute inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/85">
          <span className="text-5xl font-extrabold">Click to start display</span>
          <span className="text-xl opacity-70">Goes full screen, keeps the screen awake and turns the sound on.</span>
        </button>
      )}
    </div>
  );
}

/**
 * The LED page (D251). It polls the full view (D260): four times a second during a race, once a
 * second otherwise. A reload redraws straight from the stage (D262).
 */
export function DisplayClient({ token, initial }: { token: string; initial: DisplayState }) {
  const { state, offset } = usePoll<DisplayState>(`/api/display/${token}/state`, initial, displayEvery, false);
  return <DisplayShell state={state} offset={offset} />;
}
