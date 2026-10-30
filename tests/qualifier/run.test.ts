import { describe, expect, it } from "vitest";
import { cleanOffsets, liveWpm, perfOrigin, runClock, submissionOf } from "@/features/qualifier/run";
import { initialTyping, typeText } from "@/features/qualifier/typing";
import { RUN_MS, scoreRun, wpmOf } from "@/features/qualifier/scoring";

describe("runClock", () => {
  it("counts 3-2-1 before the start, never above 3 or below 1", () => {
    expect(runClock(-3500)).toMatchObject({ stage: "countdown", count: 3 });
    expect(runClock(-3000)).toMatchObject({ stage: "countdown", count: 3 });
    expect(runClock(-2999)).toMatchObject({ stage: "countdown", count: 3 });
    expect(runClock(-2000)).toMatchObject({ stage: "countdown", count: 2 });
    expect(runClock(-1)).toMatchObject({ stage: "countdown", count: 1 });
  });
  it("is the sprint from 0 up to 30 s, with the time left and elapsed", () => {
    expect(runClock(0)).toEqual({ stage: "sprint", count: 0, leftMs: RUN_MS, elapsedMs: 0 });
    expect(runClock(12_345)).toEqual({ stage: "sprint", count: 0, leftMs: RUN_MS - 12_345, elapsedMs: 12_345 });
  });
  it("is over at 30 s", () => {
    expect(runClock(RUN_MS)).toEqual({ stage: "over", count: 0, leftMs: 0, elapsedMs: RUN_MS });
    expect(runClock(RUN_MS + 900).stage).toBe("over");
  });
});

describe("perfOrigin", () => {
  it("places the server's start on the performance clock", () => {
    // Server is 2 s ahead of this phone; the run starts 3 s after the server's now.
    const dateNow = 1_000_000;
    const offset = 2000;
    const startsAt = dateNow + offset + 3000;
    expect(perfOrigin(startsAt, offset, dateNow, 500)).toBe(3500);
  });
});

describe("liveWpm", () => {
  const words = ["planet", "orbit", "comet"];
  it("is the final wpm at 30 s", () => {
    expect(liveWpm(words, 2, 3, RUN_MS)).toBe(wpmOf(words, 2, 3));
  });
  it("scales up over a shorter elapsed time", () => {
    expect(liveWpm(words, 1, 0, 15_000)).toBe(Math.round(wpmOf(words, 1, 0) * 2 * 10) / 10);
  });
  it("is 0 before anything elapses and damps the first two seconds", () => {
    expect(liveWpm(words, 0, 0, 0)).toBe(0);
    expect(liveWpm(words, 1, 0, 500)).toBe(liveWpm(words, 1, 0, 2000));
  });
});

describe("cleanOffsets", () => {
  it("rounds to whole ms and keeps them strictly increasing", () => {
    expect(cleanOffsets([100.4, 100.2, 200])).toEqual([99, 100, 200]);
  });
  it("keeps them within (0, 30 s]", () => {
    expect(cleanOffsets([0.2])).toEqual([1]);
    expect(cleanOffsets([29_999.6, 30_000.2])).toEqual([29_999, 30_000]);
  });
  it("lifts a crowded start back above zero", () => {
    expect(cleanOffsets([1, 1, 1])).toEqual([1, 2, 3]);
  });
  it("leaves a clean list alone", () => {
    expect(cleanOffsets([800, 1500, 2300])).toEqual([800, 1500, 2300]);
  });
});

describe("submissionOf", () => {
  const words = ["planet", "orbit", "comet", "star"];
  it("builds a body the server scores, even for two words finished in one insert", () => {
    let s = typeText(initialTyping, words, "planet orbit ", 1200.7); // one whole-text insert, same time
    s = typeText(typeText(s, words, "c", 1500), words, "o", 1600);
    const sub = submissionOf(s, words, "touch");
    expect(sub).toEqual({
      wordsDone: 2, offsets: [1200, 1201], prefix: 2, keys: 15, correctKeys: 15, device: "touch", multiInserts: 1,
    });
    expect(scoreRun(words, sub)).not.toHaveProperty("refused");
  });
});
