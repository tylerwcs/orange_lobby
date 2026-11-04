import { describe, expect, it } from "vitest";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { PHRASES, WORDS } from "@/features/qualifier/words";

describe("WORDS", () => {
  it("is ~1,000 lowercase a–z words with nothing offensive", () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(900);
    expect(WORDS.every((w) => /^[a-z]{2,12}$/.test(w))).toBe(true);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    const m = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
    expect(WORDS.filter((w) => m.hasMatch(w))).toEqual([]);
  });

  it("includes the event and hospitality words (D815)", () => {
    for (const w of ["venue", "lanyard", "registration", "hospitality", "photographer"]) expect(WORDS).toContain(w);
  });

  it("includes Ecopia's own words and phrases (D818)", () => {
    for (const w of ["ecopia", "paranoid", "flawless", "uncommon", "incentive"]) expect(WORDS).toContain(w);
    expect(PHRASES.map((p) => p.join(" "))).toContain("paranoid planning");
  });
});

describe("PHRASES", () => {
  it("are 40+ distinct two-word phrases, lowercase a–z, nothing offensive", () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(40);
    expect(PHRASES.every((p) => p.length === 2 && p.every((w) => /^[a-z]{2,12}$/.test(w)))).toBe(true);
    expect(new Set(PHRASES.map((p) => p.join(" "))).size).toBe(PHRASES.length);
    const m = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
    expect(PHRASES.filter((p) => m.hasMatch(p.join(" ")))).toEqual([]);
    // Varied first letters, so a phrase rarely has to share one with a slime already out.
    expect(new Set(PHRASES.map((p) => p[0][0])).size).toBeGreaterThanOrEqual(15);
  });
});
