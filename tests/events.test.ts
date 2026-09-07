import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases, hyphenates, strips junk", () => {
    expect(slugify("Ecopia KOM 2026!")).toBe("ecopia-kom-2026");
    expect(slugify("  SK-II   Summit ")).toBe("sk-ii-summit");
  });
});
