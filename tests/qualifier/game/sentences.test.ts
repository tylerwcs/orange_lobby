import { describe, expect, it } from "vitest";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { SENTENCES, bossSentence } from "@/features/qualifier/game/sentences";
import { mulberry32 } from "@/features/qualifier/game/rng";

describe("SENTENCES (D790)", () => {
  it("is 100+ lowercase sentences of 4–14 words with nothing offensive", () => {
    expect(SENTENCES.length).toBeGreaterThanOrEqual(100);
    expect(SENTENCES.filter((s) => !/^[a-z]+( [a-z]+)*$/.test(s))).toEqual([]);
    expect(SENTENCES.filter((s) => { const n = s.split(" ").length; return n < 4 || n > 14; })).toEqual([]);
    expect(new Set(SENTENCES).size).toBe(SENTENCES.length);
    const m = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
    expect(SENTENCES.filter((s) => m.hasMatch(s))).toEqual([]);
  });
});

describe("bossSentence", () => {
  it("gives boss n at least 3 + 2n words", () => {
    for (let n = 1; n <= 8; n++) {
      const words = bossSentence(mulberry32(1), n);
      expect(words.length).toBeGreaterThanOrEqual(3 + 2 * n);
      expect(words.every((w) => /^[a-z]+$/.test(w))).toBe(true);
    }
  });
});
