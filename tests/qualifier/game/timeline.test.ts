import { describe, expect, it } from "vitest";
import {
  checkTimeline, decodeTimeline, encodeTimeline, parseSubmitBody, reviewOf, type Entry,
} from "@/features/qualifier/game/timeline";
import { RUN_CAP_MS } from "@/features/qualifier/game/rules";

const body = () => ({ runId: "run-1", device: "touch", keys: "ab\bc", times: [0, 120, 90, 200], inserts: [1] });

/** `n` keys of "a", `gap` ms apart, the first at `start`. */
const evenKeys = (n: number, gap: number, start = 0, insert = false): Entry[] =>
  Array.from({ length: n }, (_, i) => ({ key: "a", t: start + i * gap, insert }));

describe("timeline (D791)", () => {
  it("encodes to deltas and decodes back, inserts included", () => {
    const entries: Entry[] = [
      { key: "a", t: 100, insert: false }, { key: "b", t: 250, insert: true },
      { key: "\b", t: 250, insert: false }, { key: "c", t: 900, insert: true },
    ];
    const tl = encodeTimeline(entries);
    expect(tl).toEqual({ keys: "ab\bc", times: [100, 150, 0, 650], inserts: [1, 3] });
    expect(decodeTimeline(tl)).toEqual(entries);
  });

  it("round-trips an empty timeline", () => {
    expect(decodeTimeline(encodeTimeline([]))).toEqual([]);
  });

  describe("parseSubmitBody", () => {
    it("accepts a well-formed body", () => {
      expect(parseSubmitBody(body())).toEqual(body());
    });
    it("accepts an empty timeline and every device", () => {
      for (const device of ["touch", "keyboard", "unknown"])
        expect(parseSubmitBody({ runId: "r", device, keys: "", times: [], inserts: [] })).not.toBeNull();
    });
    it("rejects a key outside [a-z\\b]", () => {
      for (const keys of ["aB", "a b", "a1", "a.", "a\n"])
        expect(parseSubmitBody({ ...body(), keys, times: Array(keys.length).fill(10), inserts: [] })).toBeNull();
    });
    it("rejects a negative or fractional time", () => {
      expect(parseSubmitBody({ ...body(), times: [0, -1, 90, 200] })).toBeNull();
      expect(parseSubmitBody({ ...body(), times: [0, 1.5, 90, 200] })).toBeNull();
      expect(parseSubmitBody({ ...body(), times: [0, "5", 90, 200] })).toBeNull();
      expect(parseSubmitBody({ ...body(), times: [0, NaN, 90, 200] })).toBeNull();
    });
    it("rejects mismatched lengths", () => {
      expect(parseSubmitBody({ ...body(), times: [0, 120, 90] })).toBeNull();
    });
    it("rejects an unsorted, repeated or out-of-range insert index", () => {
      expect(parseSubmitBody({ ...body(), inserts: [2, 1] })).toBeNull();
      expect(parseSubmitBody({ ...body(), inserts: [1, 1] })).toBeNull();
      expect(parseSubmitBody({ ...body(), inserts: [4] })).toBeNull();
      expect(parseSubmitBody({ ...body(), inserts: [-1] })).toBeNull();
      expect(parseSubmitBody({ ...body(), inserts: [0.5] })).toBeNull();
    });
    it("rejects an unknown device and a missing runId", () => {
      expect(parseSubmitBody({ ...body(), device: "tablet" })).toBeNull();
      expect(parseSubmitBody({ ...body(), device: undefined })).toBeNull();
      expect(parseSubmitBody({ ...body(), runId: undefined })).toBeNull();
      expect(parseSubmitBody({ ...body(), runId: "" })).toBeNull();
    });
    it("rejects more than 20000 keys", () => {
      const n = 20_001;
      expect(parseSubmitBody({ ...body(), keys: "a".repeat(n), times: Array(n).fill(1), inserts: [] })).toBeNull();
      const ok = 20_000;
      expect(parseSubmitBody({ ...body(), keys: "a".repeat(ok), times: Array(ok).fill(1), inserts: [] })).not.toBeNull();
    });
    it("rejects non-objects and wrong field types", () => {
      for (const b of [null, undefined, 5, "x", [], { ...body(), keys: 5 }, { ...body(), times: "no" }, { ...body(), inserts: null }])
        expect(parseSubmitBody(b)).toBeNull();
    });
  });

  describe("checkTimeline", () => {
    it("refuses 41 normal keys inside 2 s as too_fast", () => {
      expect(checkTimeline(evenKeys(41, 50))).toBe("too_fast");
    });
    it("lets 40 keys inside 2 s through", () => {
      expect(checkTimeline(evenKeys(40, 50))).toBeNull();
    });
    it("does not count insert keys toward the ceiling", () => {
      const entries = evenKeys(41, 50);
      for (let i = 0; i < 30; i++) entries[i].insert = true;
      expect(checkTimeline(entries)).toBeNull();
    });
    it("does not count backspaces toward the ceiling (R13: a keyboard rewriting a composition)", () => {
      // 41 backspaces in 2 s, many at the same instant, between ordinary letters.
      const backs: Entry[] = Array.from({ length: 41 }, (_, i) => ({ key: "\b", t: 1000 + Math.floor(i / 10) * 500, insert: false }));
      expect(checkTimeline([{ key: "a", t: 900, insert: false }, ...backs, { key: "b", t: 3200, insert: false }])).toBeNull();
    });
    it("still refuses 41 letters in 2 s with backspaces mixed in", () => {
      const entries: Entry[] = [];
      for (let i = 0; i < 41; i++) entries.push({ key: "a", t: i * 45, insert: false }, { key: "\b", t: i * 45, insert: false });
      expect(checkTimeline(entries)).toBe("too_fast");
    });
    it("finds a fast burst anywhere in a slow run", () => {
      const slow = evenKeys(20, 500);
      const burst = evenKeys(41, 40, 50_000);
      expect(checkTimeline([...slow, ...burst])).toBe("too_fast");
    });
    it("refuses a last key past RUN_CAP_MS as too_long, accepts exactly at it", () => {
      expect(checkTimeline([{ key: "a", t: RUN_CAP_MS + 1, insert: false }])).toBe("too_long");
      expect(checkTimeline([{ key: "a", t: RUN_CAP_MS, insert: false }])).toBeNull();
    });
    it("passes an empty timeline", () => {
      expect(checkTimeline([])).toBeNull();
    });
  });

  describe("reviewOf", () => {
    it("flags a run with one insert", () => {
      const entries = evenKeys(10, 300);
      entries[4].insert = true;
      const r = reviewOf(entries);
      expect(r.flagged).toBe(true);
      expect(r.inserts).toBe(1);
    });
    it("flags 60 keys exactly 100 ms apart (even timing)", () => {
      const r = reviewOf(evenKeys(60, 100));
      expect(r.flagged).toBe(true);
      expect(r.peakCps).toBe(6); // 60 keys in a 10 s window
    });
    it("does not flag 60 jittered keys at about 5 cps", () => {
      let t = 0;
      const entries: Entry[] = [];
      for (let i = 0; i < 60; i++) { t += 200 + ((i * 37) % 11) * 12 - 60; entries.push({ key: "a", t, insert: false }); }
      const r = reviewOf(entries);
      expect(r.flagged).toBe(false);
      expect(r.inserts).toBe(0);
      expect(r.peakCps).toBeGreaterThan(4.5);
      expect(r.peakCps).toBeLessThan(5.6);
    });
    it("flags a sustained burst at REVIEW_CPS", () => {
      const r = reviewOf(evenKeys(126, 80)); // 12.5 keys/s
      expect(r.flagged).toBe(true);
      expect(r.peakCps).toBeGreaterThanOrEqual(12.5);
    });
    it("reports one decimal and an empty run as unflagged zero", () => {
      expect(reviewOf([])).toEqual({ flagged: false, peakCps: 0, inserts: 0 });
      const r = reviewOf(evenKeys(7, 1000));
      expect(r.peakCps * 10).toBe(Math.round(r.peakCps * 10));
    });
    it("ignores backspaces when measuring peakCps and evenness (R13)", () => {
      const backs: Entry[] = Array.from({ length: 200 }, (_, i) => ({ key: "\b", t: 1000 + i * 10, insert: false }));
      const r = reviewOf(backs);
      expect(r).toEqual({ flagged: false, peakCps: 0, inserts: 0 });
    });
    it("ignores insert keys when measuring peakCps", () => {
      const entries = evenKeys(200, 10, 0, true);
      const r = reviewOf(entries);
      expect(r.peakCps).toBe(0);
      expect(r.flagged).toBe(true);
    });
  });
});
