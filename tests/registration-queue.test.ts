import { describe, it, expect } from "vitest";
import { registrationOpen, parseLimit, placesLabel, firstName, queueDedupeKey, movedFlash, whatsappNote } from "@/features/registration-queue/lib/rules";

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

describe("movedFlash (D682, D701)", () => {
  it("says nothing when nobody moved", () => {
    expect(movedFlash([])).toBe("");
  });

  it("names one person, and counts several", () => {
    expect(movedFlash([{ name: "Aisyah Rahman", newState: "registered" }])).toBe("Moved in Aisyah Rahman from the waiting list.");
    expect(movedFlash([{ name: "A", newState: "registered" }, { name: "B", newState: "registered" }])).toBe("Moved in 2 people from the waiting list.");
  });

  it("says pending people went to Pending approval, not in", () => {
    expect(movedFlash([{ name: "Wei Jie", newState: "pending" }])).toBe("Wei Jie moved from the waiting list to Pending approval.");
    expect(movedFlash([{ name: "A", newState: "pending" }, { name: "B", newState: "pending" }, { name: "C", newState: "registered" }]))
      .toBe("Moved in C from the waiting list. 2 people moved from the waiting list to Pending approval.");
  });
});

describe("whatsappNote (D684, D699)", () => {
  it("says what WhatsApp did, and nothing when nothing was due", () => {
    expect(whatsappNote({ sent: 0, failed: 0 })).toBe("");
    expect(whatsappNote({ sent: 1, failed: 0 })).toBe("WhatsApp sent.");
    expect(whatsappNote({ sent: 0, failed: 1 })).toBe("Not sent on WhatsApp: see the Send log on the WhatsApp page.");
    expect(whatsappNote({ sent: 2, failed: 1 })).toBe("WhatsApp sent to 2, not sent to 1: see the Send log on the WhatsApp page.");
  });
});
