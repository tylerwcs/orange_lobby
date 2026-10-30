import { describe, expect, it } from "vitest";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { WORDS, drawWords } from "@/features/qualifier/words";

describe("WORDS", () => {
  it("is ~1,000 lowercase a–z words with nothing offensive", () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(900);
    expect(WORDS.every((w) => /^[a-z]{2,10}$/.test(w))).toBe(true);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    const m = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
    expect(WORDS.filter((w) => m.hasMatch(w))).toEqual([]);
  });
});

describe("drawWords", () => {
  it("draws n words from the list", () => {
    expect(drawWords(120, () => 0)).toHaveLength(120);
    expect(drawWords(5, () => 0).every((w) => w === WORDS[0])).toBe(true);
  });
  it("never repeats a word back to back with a real random source", () => {
    const run = drawWords(5_000);
    expect(run.every((w, i) => i === 0 || w !== run[i - 1])).toBe(true);
    expect(run.every((w) => WORDS.includes(w))).toBe(true);
  });
  it("re-rolls an immediate repeat", () => {
    const seq = [0, 0, 5.5 / WORDS.length, 0];
    let i = 0;
    const out = drawWords(3, () => seq[i++] ?? 0);
    expect(out[0]).toBe(WORDS[0]);
    expect(out[1]).toBe(WORDS[5]);
    expect(out[2]).toBe(WORDS[0]);
  });
  it("stays in range when rand returns 1 and handles n <= 0", () => {
    expect(drawWords(1, () => 1)).toEqual([WORDS[WORDS.length - 1]]);
    expect(drawWords(0)).toEqual([]);
  });
});
