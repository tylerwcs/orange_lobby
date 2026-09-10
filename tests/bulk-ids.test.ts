import { describe, it, expect } from "vitest";
import { parseIds } from "@/lib/bulk";

const allowed = new Set(["a1", "a2", "a3"]);

describe("parseIds", () => {
  it("splits a comma-separated list", () => {
    expect(parseIds("a1,a2", allowed)).toEqual(["a1", "a2"]);
  });

  it("drops ids that are not this event's attendees", () => {
    expect(parseIds("a1,evil,a3", allowed)).toEqual(["a1", "a3"]);
  });

  it("de-duplicates and trims", () => {
    expect(parseIds(" a1 , a1 ,a2", allowed)).toEqual(["a1", "a2"]);
  });

  it("returns nothing for blank or null input", () => {
    expect(parseIds(null, allowed)).toEqual([]);
    expect(parseIds("", allowed)).toEqual([]);
    expect(parseIds(",,", allowed)).toEqual([]);
  });
});
