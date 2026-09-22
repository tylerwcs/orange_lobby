import { describe, it, expect } from "vitest";
import { generateToken, isValidToken, freshTokens, TOKEN_ALPHABET } from "@/lib/tokens";

describe("tokens", () => {
  it("generates 12 chars from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const t = generateToken();
      expect(t).toHaveLength(12);
      for (const c of t) expect(TOKEN_ALPHABET).toContain(c);
    }
  });
  it("does not repeat", () => {
    const set = new Set(Array.from({ length: 1000 }, generateToken));
    expect(set.size).toBe(1000);
  });
  it("validates shape", () => {
    expect(isValidToken("abcdefghjkmn")).toBe(true);
    expect(isValidToken("abcdefghjkm")).toBe(false);   // 11
    expect(isValidToken("abcdefghjkl0")).toBe(false);  // l and 0 excluded
    expect(isValidToken("ABCDEFGHJKMN")).toBe(false);  // uppercase
  });

  it("validates shape", () => {
    expect(isValidToken("abcdefghjkmn")).toBe(true);
  });
});

/**
 * The purge reissues every attendee's token in one statement, so it needs N of them up
 * front. They land in a column with a UNIQUE constraint, so "N tokens" is not enough —
 * they have to be N DISTINCT tokens, or the whole purge fails on a collision nobody can
 * reproduce.
 */
describe("freshTokens", () => {
  it("gives back exactly as many as asked for", () => {
    expect(freshTokens(50)).toHaveLength(50);
  });

  it("gives back none for none, rather than throwing", () => {
    expect(freshTokens(0)).toEqual([]);
  });

  it("never repeats one, because they land in a unique column", () => {
    const tokens = freshTokens(2000);
    expect(new Set(tokens).size).toBe(2000);
  });

  it("gives back tokens the portal would accept", () => {
    for (const t of freshTokens(100)) expect(isValidToken(t)).toBe(true);
  });
});
