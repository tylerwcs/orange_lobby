import { describe, expect, it } from "vitest";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { WORDS } from "@/features/qualifier/words";

describe("WORDS", () => {
  it("is ~1,000 lowercase a–z words with nothing offensive", () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(900);
    expect(WORDS.every((w) => /^[a-z]{2,10}$/.test(w))).toBe(true);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    const m = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
    expect(WORDS.filter((w) => m.hasMatch(w))).toEqual([]);
  });
});
