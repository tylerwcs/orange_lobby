import { describe, expect, it } from "vitest";
import {
  GRACE_MS, HARD_CEILING_WPM, REVIEW_WPM, RUN_MS, WORDS_PER_RUN,
  accuracyOf, parseSubmission, scoreRun, tooEven, wpmOf,
  type Scored, type Submission,
} from "@/features/qualifier/scoring";

const w = ["the", "cat", "sat", "down"];
// "the " + "cat " + "s" = 9 counted characters in 10 keystrokes → 3.6 wpm
const ok: Submission = { wordsDone: 2, offsets: [800, 1700], prefix: 1, keys: 10, correctKeys: 9, device: "keyboard", multiInserts: 0 };

const long = Array.from({ length: WORDS_PER_RUN }, () => "abcde");
/** n completed five-letter words, gaps that wander so tooEven stays quiet. */
const run = (n: number, step: number): Submission => ({
  wordsDone: n,
  offsets: Array.from({ length: n }, (_, i) => Math.round((i + 1) * step + (i % 3) * 40)),
  prefix: 0, keys: n * 6, correctKeys: n * 6, device: "keyboard", multiInserts: 0,
});
const fastest = run(115, 250); // 115 * 6 / 2.5 = 276 wpm
const at155 = run(65, 440);    // 65 * 6 / 2.5 = 156 wpm

describe("constants", () => {
  it("match the global constraints", () => {
    expect([RUN_MS, GRACE_MS, WORDS_PER_RUN, HARD_CEILING_WPM, REVIEW_WPM]).toEqual([30_000, 3_000, 120, 250, 150]);
  });
});

describe("wpmOf", () => {
  it("wpm = (completed chars + spaces + prefix) / 5 / 0.5 min, 1 decimal", () => {
    expect(wpmOf(["planet", "orbit"], 2, 3)).toBe(6.4); // (7 + 6 + 3) / 5 / 0.5
  });
  it("rounds to one decimal", () => {
    expect(wpmOf(["abc"], 0, 1)).toBe(0.4);
  });
});

describe("accuracyOf", () => {
  it("is a whole percent, 100 with no keys", () => {
    expect(accuracyOf(200, 197)).toBe(99); expect(accuracyOf(0, 0)).toBe(100);
  });
});

describe("scoreRun", () => {
  it("scores a plain valid run", () => {
    expect(scoreRun(w, ok)).toEqual({ wpm: 3.6, accuracy: 90, flagged: false });
  });
  it("refuses bad shapes", () => {
    expect(scoreRun(w, { ...ok, offsets: [500, 400] })).toEqual({ refused: "offsets" });     // not increasing
    expect(scoreRun(w, { ...ok, offsets: [31_000] })).toEqual({ refused: "offsets" });       // past RUN_MS
    expect(scoreRun(w, { ...ok, wordsDone: 2, offsets: [100] })).toEqual({ refused: "shape" });
    expect(scoreRun(w, { ...ok, correctKeys: ok.keys + 1 })).toEqual({ refused: "shape" });
    expect(scoreRun(w, { ...ok, prefix: w[ok.wordsDone].length + 1 })).toEqual({ refused: "shape" });
  });
  it("refuses more words than the list, a negative prefix and too few keystrokes", () => {
    expect(scoreRun(w, { ...ok, wordsDone: 4, offsets: [100, 200, 300, 400], prefix: 0, keys: 99, correctKeys: 99 }))
      .toEqual({ refused: "shape" });
    expect(scoreRun(w, { ...ok, prefix: -1 })).toEqual({ refused: "shape" });
    expect(scoreRun(w, { ...ok, keys: 8, correctKeys: 8 })).toEqual({ refused: "shape" });
  });
  it("refuses an offset of 0, and allows exactly RUN_MS", () => {
    expect(scoreRun(w, { ...ok, offsets: [0, 100] })).toEqual({ refused: "offsets" });
    expect(scoreRun(w, { ...ok, offsets: [100, RUN_MS] })).not.toHaveProperty("refused");
  });
  it("refuses above the hard ceiling and flags for review", () => {
    expect(scoreRun(long, fastest)).toEqual({ refused: "too_fast" });            // > 250 wpm
    expect((scoreRun(long, at155) as Scored).flagged).toBe(true);                // ≥ 150
    expect((scoreRun(w, { ...ok, multiInserts: 1 }) as Scored).flagged).toBe(true);
  });
  it("flags machine-regular word times", () => {
    const even: Submission = { ...run(20, 400), offsets: Array.from({ length: 20 }, (_, i) => (i + 1) * 400) };
    expect((scoreRun(long, even) as Scored).flagged).toBe(true);
  });
});

describe("tooEven", () => {
  it("flags machine-regular gaps (≥ 15 words, gap CV < 0.08)", () => {
    expect(tooEven(Array.from({ length: 20 }, (_, i) => (i + 1) * 400))).toBe(true);
    expect(tooEven([300, 900, 1200, 2000, 2300, 3100, 3500, 4400, 4700, 5600, 6000, 6800, 7100, 8000, 8600])).toBe(false);
  });
  it("needs at least 15 words", () => {
    expect(tooEven(Array.from({ length: 14 }, (_, i) => (i + 1) * 400))).toBe(false);
  });
});

describe("parseSubmission", () => {
  it("rejects junk and clamps device", () => {
    expect(parseSubmission({ wordsDone: "x" })).toBeNull();
    expect(parseSubmission({ ...ok, device: "toaster" })?.device).toBe("unknown");
  });
  it("round-trips a good body", () => {
    expect(parseSubmission({ ...ok })).toEqual(ok);
  });
  it("rejects non-objects, fractions, negatives and bad offsets", () => {
    expect(parseSubmission(null)).toBeNull();
    expect(parseSubmission("x")).toBeNull();
    expect(parseSubmission([])).toBeNull();
    expect(parseSubmission({ ...ok, keys: 1.5 })).toBeNull();
    expect(parseSubmission({ ...ok, prefix: -1 })).toBeNull();
    expect(parseSubmission({ ...ok, offsets: ["a", 2] })).toBeNull();
    expect(parseSubmission({ ...ok, offsets: [1, NaN] })).toBeNull();
    expect(parseSubmission({ ...ok, offsets: "nope" })).toBeNull();
  });
  it("caps the offsets array", () => {
    expect(parseSubmission({ ...ok, offsets: Array.from({ length: 2_000 }, (_, i) => i + 1) })).toBeNull();
  });
  it("defaults a missing device to unknown", () => {
    const rest: Partial<Submission> = { ...ok };
    delete rest.device;
    expect(parseSubmission(rest)?.device).toBe("unknown");
  });
});
