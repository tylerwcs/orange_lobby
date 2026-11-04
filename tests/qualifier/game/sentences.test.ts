import { describe, expect, it } from "vitest";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { COMPANY, SENTENCES, bossSentence, bossWords } from "@/features/qualifier/game/sentences";
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

describe("COMPANY (D818, D820)", () => {
  it("is the Ecopia group in distinct lowercase lines of exactly 14 or 12 words, nothing offensive", () => {
    expect(COMPANY.filter((s) => !/^[a-z]+( [a-z]+)*$/.test(s))).toEqual([]);
    expect(new Set(COMPANY).size).toBe(COMPANY.length);
    const lengths = COMPANY.map((s) => s.split(" ").length);
    expect(lengths.filter((n) => n !== 14 && n !== 12)).toEqual([]);
    expect(lengths.filter((n) => n === 14).length).toBeGreaterThanOrEqual(8);
    expect(lengths.filter((n) => n === 12).length).toBeGreaterThanOrEqual(8);
    // About the group's companies (D820): each named in at least two lines.
    for (const name of ["ecopia", "echelon", "fast", "qarmakrome"]) {
      expect(COMPANY.filter((s) => s.split(" ").includes(name)).length).toBeGreaterThanOrEqual(2);
    }
    const m = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
    expect(COMPANY.filter((s) => m.hasMatch(s))).toEqual([]);
  });
});

describe("bossSentence", () => {
  it("reads one of Ecopia's lines (D818)", () => {
    for (let n = 1; n <= 2; n++) for (let seed = 1; seed <= 20; seed++) {
      expect(COMPANY).toContain(bossSentence(mulberry32(seed), n).join(" "));
    }
  });

  it("gives the first boss 14 words and the last 12, exactly", () => {
    expect([1, 2, 3].map(bossWords)).toEqual([14, 12, 12]);
    for (let n = 1; n <= 3; n++) for (let seed = 1; seed <= 20; seed++) {
      const words = bossSentence(mulberry32(seed), n);
      expect(words.length).toBe(bossWords(n));
      expect(words.every((w) => /^[a-z]+$/.test(w))).toBe(true);
    }
  });
});
