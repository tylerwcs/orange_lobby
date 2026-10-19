import { describe, it, expect } from "vitest";
import { registrationOpen, parseLimit, placesLabel, firstName, queueDedupeKey } from "@/features/registration-queue/lib/rules";

const now = new Date("2026-10-19T04:00:00Z");
const ev = { status: "live" as const, registration_open: true, registration_closes_at: null as string | null };

describe("registrationOpen (D683)", () => {
  it("is open with the switch on, not archived, and no close time or one in the future", () => {
    expect(registrationOpen(ev, now)).toBe(true);
    expect(registrationOpen({ ...ev, status: "draft" }, now)).toBe(true);
    expect(registrationOpen({ ...ev, registration_closes_at: "2026-10-20T00:00:00Z" }, now)).toBe(true);
  });

  it("is closed when the switch is off, the close time has passed, or the event is archived", () => {
    expect(registrationOpen({ ...ev, registration_open: false }, now)).toBe(false);
    expect(registrationOpen({ ...ev, registration_closes_at: "2026-10-19T03:00:00Z" }, now)).toBe(false);
    expect(registrationOpen({ ...ev, registration_closes_at: "2026-10-19T04:00:00Z" }, now)).toBe(false);
    expect(registrationOpen({ ...ev, status: "archived" }, now)).toBe(false);
  });
});

describe("parseLimit (D677)", () => {
  it("accepts a positive whole number, trimmed", () => {
    expect(parseLimit("50")).toBe(50);
    expect(parseLimit(" 12 ")).toBe(12);
  });

  it("returns null (no limit) for anything else", () => {
    expect(parseLimit(null)).toBeNull();
    expect(parseLimit("")).toBeNull();
    expect(parseLimit("0")).toBeNull();
    expect(parseLimit("-3")).toBeNull();
    expect(parseLimit("2.5")).toBeNull();
    expect(parseLimit("abc")).toBeNull();
    expect(parseLimit("1e3")).toBeNull();
  });
});

describe("placesLabel", () => {
  it("says how many places are taken, even past the limit", () => {
    expect(placesLabel(12, 50)).toBe("12 of 50 places taken");
    expect(placesLabel(52, 50)).toBe("52 of 50 places taken");
  });

  it("is null without a limit", () => {
    expect(placesLabel(3, null)).toBeNull();
  });
});

describe("firstName", () => {
  it("takes the first word of the display name", () => {
    expect(firstName("Mei Ling Tan")).toBe("Mei");
    expect(firstName("  WONG CAI SHEN ")).toBe("Wong");
    expect(firstName("")).toBe("");
  });
});

describe("queueDedupeKey (D702)", () => {
  it("is stable within one admission and differs when the entry starts over", () => {
    const first = queueDedupeKey("moved_in", "e1", "2026-10-19T04:00:00.123456+00:00");
    expect(queueDedupeKey("moved_in", "e1", "2026-10-19T04:00:00.123456+00:00")).toBe(first);
    expect(queueDedupeKey("moved_in", "e1", "2026-10-20T09:00:00.000000+00:00")).not.toBe(first);
  });

  it("differs by reason and by entry", () => {
    const k = queueDedupeKey("moved_in", "e1", "t");
    expect(queueDedupeKey("approved", "e1", "t")).not.toBe(k);
    expect(queueDedupeKey("moved_in", "e2", "t")).not.toBe(k);
  });
});
