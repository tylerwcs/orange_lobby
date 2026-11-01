import { describe, expect, it } from "vitest";
import { PAUSE_MS, SLOW_FRAME_MS, SLOW_WINDOW_MS, hasWebGL, qualityOf, slowTracker } from "@/features/qualifier/game/quality";

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

describe("qualityOf", () => {
  it("is full when frames keep up and motion is allowed", () => {
    expect(qualityOf({ reducedMotion: false, slow: false, coarse: false })).toBe("full");
  });
  it("is lite once frames have been slow", () => {
    expect(qualityOf({ reducedMotion: false, slow: true, coarse: false })).toBe("lite");
  });
  it("is lite when the viewer asks for reduced motion", () => {
    expect(qualityOf({ reducedMotion: true, slow: false, coarse: false })).toBe("lite");
  });
  it("does not drop a phone to lite just for being a phone: the frame watch decides", () => {
    expect(qualityOf({ reducedMotion: false, slow: false, coarse: true })).toBe("full");
    expect(qualityOf({ reducedMotion: false, slow: true, coarse: true })).toBe("lite");
  });
});

describe("hasWebGL", () => {
  it("is false where there is no DOM (server, tests)", () => {
    expect(hasWebGL()).toBe(false);
  });
});

describe("slowTracker (moved from tunnel-mode)", () => {
  it("uses 50 ms over 2 s, and a frame over 1 s is a pause", () => {
    expect([SLOW_FRAME_MS, SLOW_WINDOW_MS, PAUSE_MS]).toEqual([50, 2000, 1000]);
  });
  it("stays quiet at 60 fps and at 30 fps", () => {
    expect(feed(slowTracker(), 0, 16, 10_000).slow).toBe(false);
    expect(feed(slowTracker(), 0, 33, 10_000).slow).toBe(false);
  });
  it("is not slow until a full 2 s has been watched", () => {
    expect(feed(slowTracker(), 0, 100, 1800).slow).toBe(false);
    expect(feed(slowTracker(), 0, 100, 2200).slow).toBe(true);
  });
  it("does not report an average of exactly 50 ms", () => {
    expect(feed(slowTracker(), 0, 50, 6000).slow).toBe(false);
  });
  it("recovers: a slow second followed by fast ones is not slow", () => {
    const t = slowTracker();
    const a = feed(t, 0, 80, 1000);
    expect(feed(t, a.now, 16, 5000).slow).toBe(false);
  });
  it("treats a long gap (a hidden tab) as a pause and starts the 2 s again", () => {
    const t = slowTracker();
    const a = feed(t, 0, 80, 1500);
    expect(t.frame(a.now + 5000, 5000)).toBe(false);
    expect(feed(t, a.now + 5000, 80, 1500).slow).toBe(false);
  });
  it("stays slow once it has said so", () => {
    const t = slowTracker();
    const a = feed(t, 0, 100, 2500);
    expect(a.slow).toBe(true);
    expect(feed(t, a.now, 8, 5000).slow).toBe(true);
  });
});
