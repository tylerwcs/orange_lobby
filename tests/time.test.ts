import { describe, it, expect } from "vitest";
import { MY_TZ, isoToLocalInput, localInputToIso, nowInKL, eventDays } from "@/lib/time";

describe("time", () => {
  it("uses the Malaysian timezone", () => {
    expect(MY_TZ).toBe("Asia/Kuala_Lumpur");
  });
  it("round trips a local datetime-local value through an ISO instant", () => {
    const iso = localInputToIso("2026-09-22T23:59");
    expect(iso).toBe("2026-09-22T23:59:00+08:00");
    expect(isoToLocalInput(iso)).toBe("2026-09-22T23:59");
  });
  it("renders a UTC instant in Kuala Lumpur time", () => {
    expect(isoToLocalInput("2026-09-22T15:59:00Z")).toBe("2026-09-22T23:59");
  });
  it("returns null for blank or malformed input", () => {
    expect(localInputToIso(null)).toBeNull();
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("22/09/2026 23:59")).toBeNull();
    expect(localInputToIso("2026-02-30T10:00")).toBeNull();
  });
  it("returns an empty string for a missing instant", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput("not a date")).toBe("");
  });
});

describe("nowInKL", () => {
  it("converts an instant to a Kuala Lumpur date and HH:MM", () => {
    expect(nowInKL(new Date("2026-09-30T02:05:00Z"))).toEqual({ date: "2026-09-30", time: "10:05" });
    expect(nowInKL(new Date("2026-09-30T17:30:00Z"))).toEqual({ date: "2026-10-01", time: "01:30" });
  });
});

describe("eventDays", () => {
  it("returns nothing when the event has no dates", () => {
    expect(eventDays(null, null)).toEqual([]);
  });

  it("returns the single day when an event starts and ends the same day", () => {
    expect(eventDays("2026-09-30", "2026-09-30")).toEqual(["2026-09-30"]);
  });

  it("returns every day across a range, inclusive", () => {
    expect(eventDays("2026-09-30", "2026-10-01")).toEqual(["2026-09-30", "2026-10-01"]);
  });

  it("falls back to the start day when there is no end, or the end precedes the start", () => {
    expect(eventDays("2026-09-30", null)).toEqual(["2026-09-30"]);
    expect(eventDays("2026-09-30", "2026-09-29")).toEqual(["2026-09-30"]);
  });

  it("uses the end day when only that is set", () => {
    expect(eventDays(null, "2026-10-01")).toEqual(["2026-10-01"]);
  });

  it("caps a nonsense range rather than looping forever", () => {
    expect(eventDays("2026-01-01", "2027-01-01")).toHaveLength(14);
  });
});
