import { describe, expect, it } from "vitest";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { SENTENCES, bossSentence, bossWords } from "@/features/qualifier/game/sentences";
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
  it("gives the first boss 12 words and the last 10, exactly", () => {
    expect([1, 2, 3].map(bossWords)).toEqual([12, 10, 10]);
    for (let n = 1; n <= 3; n++) for (let seed = 1; seed <= 20; seed++) {
      const words = bossSentence(mulberry32(seed), n);
      expect(words.length).toBe(bossWords(n));
      expect(words.every((w) => /^[a-z]+$/.test(w))).toBe(true);
    }
  });
});
