import { describe, expect, it } from "vitest";
import { buildPassport, completionByAttendee, progressLine, stampsTarget } from "@/lib/booths";
import type { Booth, BoothStamp } from "@/lib/types";

const booth = (id: string, sort_order = 0): Booth => ({
  id, org_id: "o", event_id: "e", activity_id: "p1", name: id, location: null, token: `tok${id}`, sort_order,
});
const stamp = (booth_id: string, attendee_id: string, stamped_at: string): BoothStamp => ({
  id: `${booth_id}-${attendee_id}`, org_id: "o", event_id: "e", booth_id, attendee_id, stamped_at,
});

describe("stampsTarget", () => {
  it("is the booth count when no target is configured", () => {
    expect(stampsTarget(5, null)).toBe(5);
  });

  it("is the configured target when it is lower than the booth count", () => {
    expect(stampsTarget(5, 3)).toBe(3);
  });

  // A booth deleted after the target was typed must not leave the card asking for 7 of 5.
  it("clamps a target above the booth count", () => {
    expect(stampsTarget(5, 7)).toBe(5);
  });

  it("is zero when the event has no booths", () => {
    expect(stampsTarget(0, 3)).toBe(0);
  });

  it("treats a zero or negative target as every booth", () => {
    expect(stampsTarget(4, 0)).toBe(4);
    expect(stampsTarget(4, -1)).toBe(4);
  });
});

describe("buildPassport", () => {
  const booths = [booth("b1", 0), booth("b2", 1), booth("b3", 2)];

  it("marks a cell for every booth, stamped or not, in the order given", () => {
    const p = buildPassport(booths, [stamp("b2", "a1", "2026-09-30T02:41:00Z")], null);
    expect(p.cells.map((c) => c.booth.id)).toEqual(["b1", "b2", "b3"]);
    expect(p.cells.map((c) => c.stampedAt)).toEqual([null, "2026-09-30T02:41:00Z", null]);
  });

  it("counts what is collected and what is left", () => {
    const p = buildPassport(booths, [
      stamp("b1", "a1", "2026-09-30T02:24:00Z"),
      stamp("b2", "a1", "2026-09-30T02:41:00Z"),
    ], null);
    expect(p.collected).toBe(2);
    expect(p.target).toBe(3);
    expect(p.remaining).toBe(1);
    expect(p.complete).toBe(false);
    expect(p.completedAt).toBeNull();
  });

  // The card fills at the target, not at the last booth — completedAt is the moment it filled.
  it("completes at the target and reports when it filled", () => {
    const p = buildPassport(booths, [
      stamp("b1", "a1", "2026-09-30T02:24:00Z"),
      stamp("b3", "a1", "2026-09-30T07:42:00Z"),
      stamp("b2", "a1", "2026-09-30T03:05:00Z"),
    ], 2);
    expect(p.complete).toBe(true);
    expect(p.remaining).toBe(0);
    // Second-earliest stamp: b1 02:24, then b2 03:05.
    expect(p.completedAt).toBe("2026-09-30T03:05:00Z");
  });

  it("ignores stamps belonging to booths that no longer exist", () => {
    const p = buildPassport(booths, [stamp("gone", "a1", "2026-09-30T02:24:00Z")], null);
    expect(p.collected).toBe(0);
  });

  it("is never complete when the event has no booths", () => {
    const p = buildPassport([], [], null);
    expect(p.target).toBe(0);
    expect(p.complete).toBe(false);
  });
});

describe("progressLine", () => {
  it("counts down to the target", () => {
    expect(progressLine({ collected: 2, target: 5, remaining: 3, complete: false })).toBe("2 of 5 · 3 more to go");
  });

  it("uses the singular for the last one", () => {
    expect(progressLine({ collected: 4, target: 5, remaining: 1, complete: false })).toBe("4 of 5 · 1 more to go");
  });

  it("says so when the card is full", () => {
    expect(progressLine({ collected: 5, target: 5, remaining: 0, complete: true })).toBe("Card full · 5 stamps");
  });

  it("guards: target below booth count cannot produce X of Y when complete", () => {
    expect(progressLine({ collected: 5, target: 3, remaining: 0, complete: true })).toBe("Card full · 5 stamps");
  });

  it("uses singular when the card is full with one stamp", () => {
    expect(progressLine({ collected: 1, target: 1, remaining: 0, complete: true })).toBe("Card full · 1 stamp");
  });

  it("says nothing numeric when there are no booths", () => {
    expect(progressLine({ collected: 0, target: 0, remaining: 0, complete: false })).toBe("No booths yet");
  });
});

describe("completionByAttendee", () => {
  const booths = [booth("b1"), booth("b2"), booth("b3")];

  it("counts each attendee separately and only counts live booths", () => {
    const m = completionByAttendee(booths, [
      stamp("b1", "a1", "2026-09-30T02:24:00Z"),
      stamp("b2", "a1", "2026-09-30T02:41:00Z"),
      stamp("gone", "a1", "2026-09-30T02:50:00Z"),
      stamp("b1", "a2", "2026-09-30T03:00:00Z"),
    ], 2);
    expect(m.get("a1")).toEqual({ collected: 2, complete: true });
    expect(m.get("a2")).toEqual({ collected: 1, complete: false });
  });

  it("has no entry for an attendee with no stamps", () => {
    const m = completionByAttendee(booths, [], null);
    expect(m.get("a3")).toBeUndefined();
  });
});
