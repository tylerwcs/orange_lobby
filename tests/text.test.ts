import { describe, it, expect } from "vitest";
import { initials, formatDateRange } from "@/lib/text";

describe("text helpers", () => {
  it("initials take the first two words, uppercase", () => {
    expect(initials("Ecopia Kick-Off Meeting 2026")).toBe("EK");
    expect(initials("Aiman")).toBe("A");
    expect(initials("  ")).toBe("?");
  });
  it("formats date ranges in Malaysia style", () => {
    expect(formatDateRange("2026-09-30", "2026-10-01")).toBe("30 Sep – 1 Oct 2026");
    expect(formatDateRange("2026-09-30", "2026-09-30")).toBe("30 Sep 2026");
    expect(formatDateRange("2026-09-30", null)).toBe("30 Sep 2026");
    expect(formatDateRange(null, null)).toBe("");
  });
});
