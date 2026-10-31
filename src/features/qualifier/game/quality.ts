// How much the slime scene draws (D793). Pure apart from the WebGL probe, so the rules are tested
// without a browser. The scene degrades on a weak device; the typing never does.

/** An average frame time over this many ms ... */
export const SLOW_FRAME_MS = 50;
/** ... held for this long means the device cannot draw the full scene. */
export const SLOW_WINDOW_MS = 2000;
/**
 * A frame longer than this is a pause (a hidden tab, a lock screen), not slowness: the watch
 * starts again after it.
 */
export const PAUSE_MS = 1000;

/** `full`: every object, soft shadows, up to 1.75× pixels. `lite`: half the objects, no shadows, 1× pixels. */
export type Quality = "full" | "lite";

/**
 * Lite once frames have been too slow, or when the viewer asks for reduced motion (lite also
 * keeps the camera still: no sway, no shake). A coarse pointer (a phone) alone is not a reason:
 * plenty of phones draw the full scene, and the frame watch catches the ones that can't.
 */
export function qualityOf(s: { reducedMotion: boolean; slow: boolean; coarse: boolean }): Quality {
  return s.slow || s.reducedMotion ? "lite" : "full";
}

let webgl: boolean | null = null;

/** three needs WebGL 2. Probed once per page; the probe context is released at once. False without a DOM. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  if (webgl !== null) return webgl;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

export type SlowTracker = {
  /** One drawn frame: `nowMs` on any steady clock, `dtMs` its length. True once the scene is slow. */
  frame(nowMs: number, dtMs: number): boolean;
};

/**
 * Watches the frames of a run. Once 2 s have been watched and the average frame in the last 2 s
 * is over 50 ms it says slow, and keeps saying so: the caller drops to lite for good.
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
