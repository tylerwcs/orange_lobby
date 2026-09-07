import { describe, it, expect } from "vitest";
import { generateToken, isValidToken, TOKEN_ALPHABET } from "@/lib/tokens";

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
});
