import { describe, it, expect } from "vitest";
import { barName, parseDisplayName, shownName } from "@/lib/event-name";

describe("parseDisplayName (D633)", () => {
  it("keeps the organiser's line breaks, tidying each line", () => {
    expect(parseDisplayName("UOB Innovation Hub 2\r\n  Gala   Dinner ", "UOB Innovation Hub 2 Gala Dinner"))
      .toBe("UOB Innovation Hub 2\nGala Dinner");
  });

  it("drops blank lines and stops at three lines", () => {
    expect(parseDisplayName("A\n\n\nB\nC\nD", "x")).toBe("A\nB\nC");
  });

  it("is unset when blank or the same as the plain name", () => {
    for (const raw of [null, undefined, "", "  \n "]) expect(parseDisplayName(raw, "Gala")).toBeNull();
    expect(parseDisplayName("  Gala ", "Gala")).toBeNull();
  });
});

describe("shownName", () => {
  it("prefers the display name, else the name", () => {
    expect(shownName({ name: "UOB Gala", display_name: "UOB\nGala" })).toBe("UOB\nGala");
    expect(shownName({ name: "UOB Gala", display_name: null })).toBe("UOB Gala");
    expect(shownName({ name: "UOB Gala" })).toBe("UOB Gala");
  });
});

describe("barName (D635)", () => {
  it("keeps the plain name in the top bar unless the organiser opts in", () => {
    const e = { name: "UOB Gala", display_name: "UOB\nGala" };
    expect(barName(e)).toBe("UOB Gala");
    expect(barName({ ...e, display_name_in_bar: false })).toBe("UOB Gala");
    expect(barName({ ...e, display_name_in_bar: true })).toBe("UOB\nGala");
    expect(barName({ name: "UOB Gala", display_name: null, display_name_in_bar: true })).toBe("UOB Gala");
  });
});
