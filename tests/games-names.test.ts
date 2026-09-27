import { describe, expect, it } from "vitest";
import { tag, tagLabel } from "@/lib/games/names";

describe("tag", () => {
  it("takes the first letters of the first two words and the first word", () => {
    expect(tag("Priya Ramasamy")).toEqual({ initials: "PR", first: "Priya" });
  });
  it("uses the first word even when it is a surname (D273)", () => {
    expect(tag("Tan Mei Ling")).toEqual({ initials: "TM", first: "Tan" });
  });
  it("copes with one word, stray spaces and lower case", () => {
    expect(tag("  cher  ")).toEqual({ initials: "C", first: "cher" });
  });
  it("does not split a multi-byte first letter", () => {
    expect(tag("Élodie Martin").initials).toBe("ÉM");
  });
  it("falls back to ? for an empty name", () => {
    expect(tag("   ")).toEqual({ initials: "?", first: "" });
  });
});

describe("tagLabel", () => {
  it("joins initials and first name", () => {
    expect(tagLabel("Priya Ramasamy")).toBe("PR · Priya");
  });
  it("is just the initials when there is no name", () => {
    expect(tagLabel("")).toBe("?");
  });
});
