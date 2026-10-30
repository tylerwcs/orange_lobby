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

/**
 * May the 3D chunk be fetched and evaluated now? Never while a run is on (the countdown or the
 * sprint): evaluating three is a long main-thread task, and the typing must never wait on it.
 */
export function mayPreload(s: { running: boolean; reducedMotion: boolean; slow: boolean }): boolean {
  return !s.running && !s.reducedMotion && !s.slow;
}

/**
 * May the 3D canvas be mounted now? Creating the canvas and compiling its shaders is a long task
 * too, so only before the sprint, and only once the chunk is already loaded. Once mounted it
 * stays; if it was not mounted before the sprint began, this run stays 2D.
 */
export function mayMount3D(s: { sprint: boolean; loaded: boolean; mounted: boolean }): boolean {
  return s.mounted || (s.loaded && !s.sprint);
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
