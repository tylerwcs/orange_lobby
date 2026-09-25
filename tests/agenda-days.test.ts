import { describe, it, expect } from "vitest";
import { dayTabs, dayLabel, nextFreeDate, suggestedDayDate } from "@/lib/agenda";

describe("dayTabs", () => {
  it("lists the organiser's days in date order, with their names", () => {
    const tabs = dayTabs(
      [{ date: "2026-10-01", name: "Day 2 (Teambuilding)" }, { date: "2026-09-30", name: "Day 1 (Conference)" }],
      [],
    );
    expect(tabs).toEqual([
      { date: "2026-09-30", name: "Day 1 (Conference)" },
      { date: "2026-10-01", name: "Day 2 (Teambuilding)" },
    ]);
  });

  it("keeps a day with nothing on it", () => {
    expect(dayTabs([{ date: "2026-09-30", name: null }], [])).toEqual([{ date: "2026-09-30", name: null }]);
  });

  it("adds a date the viewer has a row on but no day - a booking must stay reachable (D199)", () => {
    const tabs = dayTabs([{ date: "2026-09-30", name: "Day 1" }], [{ day: "2026-09-22" }, { day: "2026-09-30" }]);
    expect(tabs).toEqual([{ date: "2026-09-22", name: null }, { date: "2026-09-30", name: "Day 1" }]);
  });

  it("treats a blank name as no name", () => {
    expect(dayTabs([{ date: "2026-09-30", name: "   " }], [])).toEqual([{ date: "2026-09-30", name: null }]);
  });
});

describe("dayLabel", () => {
  it("is the name and the short date when named, the date alone when not", () => {
    expect(dayLabel({ date: "2026-09-30", name: "Day 1 (Conference)" })).toBe("Day 1 (Conference) · Wed 30 Sep");
    expect(dayLabel({ date: "2026-09-30", name: null })).toBe("Wed 30 Sep");
  });
});

describe("nextFreeDate", () => {
  it("is the first event date without a day", () => {
    expect(nextFreeDate(["2026-09-30", "2026-10-01"], ["2026-09-30"])).toBe("2026-10-01");
  });
  it("is null when every event date has a day, or the event has no dates", () => {
    expect(nextFreeDate(["2026-09-30"], ["2026-09-30"])).toBeNull();
    expect(nextFreeDate([], [])).toBeNull();
  });
});

describe("suggestedDayDate", () => {
  it("is the first free event date while there is one", () => {
    expect(suggestedDayDate(["2026-09-30", "2026-10-01"], ["2026-09-30"], "2026-09-25")).toBe("2026-10-01");
  });
  it("is the day after the latest day once every event date is taken, never a taken one", () => {
    expect(suggestedDayDate(["2026-09-30", "2026-10-01"], ["2026-10-01", "2026-09-30"], "2026-09-25")).toBe("2026-10-02");
    expect(suggestedDayDate(["2026-12-31"], ["2026-12-31"], "2026-09-25")).toBe("2027-01-01");
  });
  it("is today for an event with no dates and no days", () => {
    expect(suggestedDayDate([], [], "2026-09-25")).toBe("2026-09-25");
  });
});
