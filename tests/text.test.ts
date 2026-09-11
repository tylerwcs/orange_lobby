import { describe, it, expect } from "vitest";
import { initials, formatDateRange, shortDate, shortDateTime, elapsed } from "@/lib/text";

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

import { shortTime } from "@/lib/text";

describe("shortTime", () => {
  it("formats an instant as HH:MM in Kuala Lumpur", () => {
    expect(shortTime("2026-09-30T01:05:00Z")).toBe("09:05");
    expect(shortTime("not a date")).toBe("");
  });
});

import { displayName } from "@/lib/text";

describe("displayName", () => {
  it("title-cases shouting names and leaves mixed case alone", () => {
    expect(displayName("WONG CAI SHEN")).toBe("Wong Cai Shen");
    expect(displayName("Aiman bin Rashid")).toBe("Aiman bin Rashid");
    expect(displayName("  ")).toBe("");
  });
});

describe("elapsed", () => {
  const now = new Date("2026-09-30T10:00:00+08:00");

  it("says just now under a minute", () => {
    expect(elapsed("2026-09-30T09:59:30+08:00", now)).toBe("just now");
  });

  it("counts whole minutes under an hour", () => {
    expect(elapsed("2026-09-30T09:58:00+08:00", now)).toBe("2 min ago");
    expect(elapsed("2026-09-30T09:01:00+08:00", now)).toBe("59 min ago");
  });

  it("counts whole hours under a day", () => {
    expect(elapsed("2026-09-30T08:00:00+08:00", now)).toBe("2 h ago");
    expect(elapsed("2026-09-29T11:00:00+08:00", now)).toBe("23 h ago");
  });

  it("falls back to the shared short date beyond a day", () => {
    expect(elapsed("2026-09-28T10:00:00+08:00", now)).toBe("Mon 28 Sep");
  });

  it("does not render a future scan as a negative age", () => {
    expect(elapsed("2026-09-30T10:05:00+08:00", now)).toBe("just now");
  });
});
