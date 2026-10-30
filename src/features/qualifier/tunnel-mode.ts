// When the gate tunnel stays 2D (D773). Pure, so the rules are tested without a browser: the 3D
// scene is decoration and must never cost the player a keystroke.

/** An average frame time over this many ms ... */
export const SLOW_FRAME_MS = 50;
/** ... held for this long means the device cannot draw the scene. */
export const SLOW_WINDOW_MS = 2000;
/**
 * A frame longer than this is a pause (a hidden tab, a lock screen), not slowness: the watch
 * starts again after it.
 */
export const PAUSE_MS = 1000;

export type TunnelMode = "3d" | "2d";

/** 3D only when the viewer allows motion, WebGL could be created and frames have kept up. */
export function tunnelMode(s: { reducedMotion: boolean; webgl: boolean; slow: boolean }): TunnelMode {
  return !s.reducedMotion && s.webgl && !s.slow ? "3d" : "2d";
}

export type SlowTracker = {
  /** One drawn frame: `nowMs` on any steady clock, `dtMs` its length. True once the scene is slow. */
  frame(nowMs: number, dtMs: number): boolean;
};

/**
 * Watches the frames of a run. Once 2 s have been watched and the average frame in the last 2 s
 * is over 50 ms it says slow, and keeps saying so: the caller drops to 2D for good.
 */
export function slowTracker(): SlowTracker {
  let samples: { at: number; dt: number }[] = [];
  let sum = 0;
  let since: number | null = null;
  let slow = false;
  return {
    frame(nowMs, dtMs) {
      if (slow) return true;
      if (!(dtMs <= PAUSE_MS)) {
        samples = [];
        sum = 0;
        since = null;
        return false;
      }
      since ??= nowMs - dtMs;
      samples.push({ at: nowMs, dt: dtMs });
      sum += dtMs;
      let drop = 0;
      while (drop < samples.length - 1 && samples[drop].at <= nowMs - SLOW_WINDOW_MS) sum -= samples[drop++].dt;
      if (drop > 0) samples = samples.slice(drop);
      slow = nowMs - since >= SLOW_WINDOW_MS && sum / samples.length > SLOW_FRAME_MS;
      return slow;
    },
  };
}
