import { describe, expect, it } from "vitest";
import { crewLinkLastDay, crewLinkLive } from "@/lib/crew";

const ev = (starts_on: string | null, ends_on: string | null, status = "live") =>
  ({ starts_on, ends_on, status }) as Parameters<typeof crewLinkLive>[0];

describe("crewLinkLastDay", () => {
  it("is one day after the event ends", () => {
    expect(crewLinkLastDay(ev("2026-09-30", "2026-10-01"))).toBe("2026-10-02");
  });

  it("falls back to the start date when there is no end date", () => {
    expect(crewLinkLastDay(ev("2026-09-30", null))).toBe("2026-10-01");
  });

  // Month and year boundaries are where hand-rolled date maths goes wrong.
  it("crosses a month boundary", () => {
    expect(crewLinkLastDay(ev("2026-08-30", "2026-08-31"))).toBe("2026-09-01");
  });

  it("crosses a year boundary", () => {
    expect(crewLinkLastDay(ev("2026-12-30", "2026-12-31"))).toBe("2027-01-01");
  });

  it("has no last day when the event has no dates", () => {
    expect(crewLinkLastDay(ev(null, null))).toBeNull();
  });
});

describe("crewLinkLive", () => {
  it("works before and during the event", () => {
    expect(crewLinkLive(ev("2026-09-30", "2026-10-01"), "2026-09-17")).toBe(true);
    expect(crewLinkLive(ev("2026-09-30", "2026-10-01"), "2026-09-30")).toBe(true);
    expect(crewLinkLive(ev("2026-09-30", "2026-10-01"), "2026-10-01")).toBe(true);
  });

  // One day of grace, so a late teardown scan still works.
  it("works on the grace day after the event", () => {
    expect(crewLinkLive(ev("2026-09-30", "2026-10-01"), "2026-10-02")).toBe(true);
  });

  it("stops the day after the grace day", () => {
    expect(crewLinkLive(ev("2026-09-30", "2026-10-01"), "2026-10-03")).toBe(false);
  });

  // D107: an undated event is one being set up, and a dry run is when the link is first tried.
  it("never expires when the event has no dates", () => {
    expect(crewLinkLive(ev(null, null), "2030-01-01")).toBe(true);
  });

  // An archived event is closed everywhere else in this app; the crew link is no exception.
  it("is dead once the event is archived", () => {
    expect(crewLinkLive(ev("2026-09-30", "2026-10-01", "archived"), "2026-09-30")).toBe(false);
  });
});
