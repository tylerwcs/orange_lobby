import { describe, expect, it } from "vitest";
import { nicknameOf, tag, tagsFor } from "@/lib/games/names";

const nick = (name: string, nickname?: string) => ({ name, extra: nickname === undefined ? {} : { nickname } });

describe("tag (D365)", () => {
  it("is the nickname when there is one", () => {
    expect(tag(nick("Wong Cai Shen", "Cai Shen"))).toEqual({ initials: "CS", label: "Cai Shen" });
  });
  it("takes a one-word nickname's single initial", () => {
    expect(tag(nick("Lim Mei Ling", "Mei"))).toEqual({ initials: "M", label: "Mei" });
  });
  it("tidies stray spaces in the nickname", () => {
    expect(nicknameOf(nick("x", "  Ah   Boy "))).toBe("Ah Boy");
  });
  it("falls back to first word and next initial without a nickname", () => {
    expect(tag(nick("Priya Ramasamy"))).toEqual({ initials: "PR", label: "Priya R." });
    expect(tag(nick("Priya Ramasamy", "   "))).toEqual({ initials: "PR", label: "Priya R." });
  });
  it("copes with one word and a missing extra", () => {
    expect(tag({ name: "  cher  " })).toEqual({ initials: "C", label: "cher" });
    expect(tag({ name: "Cher", extra: null })).toEqual({ initials: "C", label: "Cher" });
  });
  it("does not split a multi-byte first letter", () => {
    expect(tag(nick("Élodie Martin")).initials).toBe("ÉM");
  });
  it("falls back to ? for an empty name", () => {
    expect(tag(nick("   "))).toEqual({ initials: "?", label: "?" });
  });
});

describe("tagsFor (D365)", () => {
  it("adds full-name initials only where two people would read the same", () => {
    const tags = tagsFor([
      { id: "a", ...nick("Tan Jason", "Jason") },
      { id: "b", ...nick("Jason Lee", "jason") },
      { id: "c", ...nick("Wong Cai Shen", "Cai Shen") },
    ]);
    expect(tags.get("a")?.label).toBe("Jason (TJ)");
    expect(tags.get("b")?.label).toBe("jason (JL)");
    expect(tags.get("c")?.label).toBe("Cai Shen");
  });
});
