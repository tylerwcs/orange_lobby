import { describe, it, expect } from "vitest";
import { mergeExtra } from "@/lib/attendee-merge";

describe("mergeExtra", () => {
  it("keeps existing keys that incoming omits", () => {
    const result = mergeExtra({ tshirt: "M", remarks: "none" }, { tshirt: "L" });
    expect(result).toEqual({ tshirt: "L", remarks: "none" });
  });

  it("lets incoming override existing on collision", () => {
    const result = mergeExtra({ tshirt: "M" }, { tshirt: "XL" });
    expect(result.tshirt).toBe("XL");
  });

  it("returns a copy equal to existing when incoming is undefined", () => {
    const existing = { tshirt: "M", remarks: "none" };
    const result = mergeExtra(existing, undefined);
    expect(result).toEqual(existing);
    expect(result).not.toBe(existing);
  });
});
