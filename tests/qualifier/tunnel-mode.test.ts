import { describe, expect, it } from "vitest";
import { PAUSE_MS, SLOW_FRAME_MS, SLOW_WINDOW_MS, mayMount3D, mayPreload, slowTracker, tunnelMode } from "@/features/qualifier/tunnel-mode";

/** Feeds `ms`-long frames from `from` for `total` ms; returns the clock after the last frame. */
function feed(t: ReturnType<typeof slowTracker>, from: number, ms: number, total: number) {
  let now = from;
  let slow = false;
  for (let spent = 0; spent < total; spent += ms) {
    now += ms;
    slow = t.frame(now, ms);
  }
  return { now, slow };
}

describe("tunnelMode (D773)", () => {
  it("is 3D only when motion is allowed, WebGL works and frames have been fast enough", () => {
    expect(tunnelMode({ reducedMotion: false, webgl: true, slow: false })).toBe("3d");
  });
  it("is 2D for reduced motion, no WebGL, or after slow frames", () => {
    expect(tunnelMode({ reducedMotion: true, webgl: true, slow: false })).toBe("2d");
    expect(tunnelMode({ reducedMotion: false, webgl: false, slow: false })).toBe("2d");
    expect(tunnelMode({ reducedMotion: false, webgl: true, slow: true })).toBe("2d");
  });
});

describe("slowTracker (D773)", () => {
  it("uses 50 ms over 2 s", () => {
    expect([SLOW_FRAME_MS, SLOW_WINDOW_MS]).toEqual([50, 2000]);
  });

  it("stays quiet at 60 fps and at 30 fps", () => {
    expect(feed(slowTracker(), 0, 16, 10_000).slow).toBe(false);
    expect(feed(slowTracker(), 0, 33, 10_000).slow).toBe(false);
  });

  it("is not slow until a full 2 s has been watched", () => {
    const t = slowTracker();
    expect(feed(t, 0, 100, 1800).slow).toBe(false);
    expect(feed(slowTracker(), 0, 100, 2200).slow).toBe(true);
  });

  it("reports slow once the average passes 50 ms over 2 s", () => {
    expect(feed(slowTracker(), 0, 60, 3000).slow).toBe(true);
  });

  it("does not report an average of exactly 50 ms", () => {
    expect(feed(slowTracker(), 0, 50, 6000).slow).toBe(false);
  });

  it("forgives one bad frame among good ones", () => {
    const t = slowTracker();
    const a = feed(t, 0, 16, 1000);
    t.frame(a.now + 400, 400); // one long hitch
    expect(feed(t, a.now + 400, 16, 4000).slow).toBe(false);
  });

  it("recovers: a slow second followed by fast ones is not slow", () => {
    const t = slowTracker();
    const a = feed(t, 0, 80, 1000);
    expect(feed(t, a.now, 16, 5000).slow).toBe(false);
  });

  it("treats a long gap (a hidden tab) as a pause, not as a slow frame", () => {
    const t = slowTracker();
    const a = feed(t, 0, 16, 1000);
    expect(t.frame(a.now + 5000, 5000)).toBe(false);
    expect(feed(t, a.now + 5000, 16, 4000).slow).toBe(false);
    expect(PAUSE_MS).toBeGreaterThan(SLOW_FRAME_MS);
  });

  it("starts the 2 s again after a pause", () => {
    const t = slowTracker();
    const a = feed(t, 0, 80, 1500);
    t.frame(a.now + 5000, 5000); // pause: the 1.5 s already watched is forgotten
    expect(feed(t, a.now + 5000, 80, 1500).slow).toBe(false);
  });

  it("stays slow once it has said so", () => {
    const t = slowTracker();
    const a = feed(t, 0, 100, 2500);
    expect(a.slow).toBe(true);
    expect(feed(t, a.now, 8, 5000).slow).toBe(true);
  });
});

describe("mayPreload (D773)", () => {
  it("allows the warm-up only between runs, with motion allowed and frames fast", () => {
    expect(mayPreload({ running: false, reducedMotion: false, slow: false })).toBe(true);
  });
  it("never during a run (countdown or sprint)", () => {
    expect(mayPreload({ running: true, reducedMotion: false, slow: false })).toBe(false);
  });
  it("not for reduced motion or after slow frames", () => {
    expect(mayPreload({ running: false, reducedMotion: true, slow: false })).toBe(false);
    expect(mayPreload({ running: false, reducedMotion: false, slow: true })).toBe(false);
  });
});

describe("mayMount3D (D773)", () => {
  it("mounts once loaded, before the sprint", () => {
    expect(mayMount3D({ sprint: false, loaded: true, mounted: false })).toBe(true);
  });
  it("does not mount while the chunk is still loading", () => {
    expect(mayMount3D({ sprint: false, loaded: false, mounted: false })).toBe(false);
  });
  it("never mounts during the sprint, loaded or not: that run stays 2D", () => {
    expect(mayMount3D({ sprint: true, loaded: true, mounted: false })).toBe(false);
    expect(mayMount3D({ sprint: true, loaded: false, mounted: false })).toBe(false);
  });
  it("stays mounted through the sprint once it was mounted before it", () => {
    expect(mayMount3D({ sprint: true, loaded: true, mounted: true })).toBe(true);
  });
});
