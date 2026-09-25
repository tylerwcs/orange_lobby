import { describe, it, expect } from "vitest";
import { matchesSearch } from "@/lib/attendee-search";

describe("attendee table search", () => {
  const row = ["Tan Ah Kow", "ahkow@ecopia.com", "VIP", "import", "Ecopia Events", "T12", "B3"];

  it("matches any column, not just name and email", () => {
    expect(matchesSearch(row, "ecopia events")).toBe(true);
    expect(matchesSearch(row, "t12")).toBe(true);
    expect(matchesSearch(row, "B3")).toBe(true);
  });
  it("needs every word, in any column and any order", () => {
    expect(matchesSearch(row, "vip tan")).toBe(true);
    expect(matchesSearch(row, "vip lee")).toBe(false);
  });
  it("does not match a word split across two columns", () => {
    // "VIP" then "import": joined with a separator, so "vipimport" is not a hit.
    expect(matchesSearch(row, "vipimport")).toBe(false);
  });
  it("ignores case and surrounding spaces", () => {
    expect(matchesSearch(row, "  AHKOW@  ")).toBe(true);
  });
  it("skips empty columns and treats a blank query as everyone", () => {
    expect(matchesSearch([null, undefined, "", "Lee"], "lee")).toBe(true);
    expect(matchesSearch(row, "   ")).toBe(true);
  });
  it("takes wildcard and separator characters literally", () => {
    expect(matchesSearch(["50% off"], "50%")).toBe(true);
    expect(matchesSearch(["Tan"], "%")).toBe(false);
  });
});
