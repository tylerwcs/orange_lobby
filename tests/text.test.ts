import { describe, it, expect } from "vitest";
import { initials, formatDateRange, shortDate, shortDateTime } from "@/lib/text";

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
  it("formats a single day with its weekday, never 'Sept'", () => {
    expect(shortDate("2026-09-30")).toBe("Wed 30 Sep");
    expect(shortDate("2026-09-09")).toBe("Wed 9 Sep");
    expect(shortDate("2026-09-10")).toBe("Thu 10 Sep");
  });
  it("formats an instant in Malaysian time", () => {
    expect(shortDateTime("2026-09-08T09:13:00Z")).toBe("8 Sep, 17:13");
    // 23:30 UTC lands on the next Malaysian day.
    expect(shortDateTime("2026-09-08T23:30:00Z")).toBe("9 Sep, 07:30");
  });
});
