import { describe, expect, it } from "vitest";
import { periodOf, sessionGrid, startDay } from "@/lib/session-grid";
import type { SeatsForViewer } from "@/lib/activities";

let n = 0;
const seat = (day: string, starts_at: string, over: Partial<SeatsForViewer["session"]> = {}, state: Partial<Omit<SeatsForViewer, "session">> = {}): SeatsForViewer => ({
  session: {
    id: `s${n++}`, event_id: "e", activity_id: "a", day, starts_at,
    ends_at: addMinutes(starts_at, 15), location: "Gardensby17", capacity: 3, sort_order: 0, ...over,
  },
  booked: 0, left: 3, full: false, mine: false, ...state,
});
function addMinutes(hhmm: string, m: number) {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = h * 60 + mm + m;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

describe("periodOf", () => {
  it("splits the day at noon and five", () => {
    expect(periodOf("08:00")).toBe("Morning");
    expect(periodOf("11:59")).toBe("Morning");
    expect(periodOf("12:00")).toBe("Afternoon");
    expect(periodOf("16:59")).toBe("Afternoon");
    expect(periodOf("17:00")).toBe("Evening");
  });
});

describe("sessionGrid", () => {
  it("groups by day, then by part of the day, in time order", () => {
    const g = sessionGrid([seat("2026-09-29", "11:00"), seat("2026-09-28", "14:00"), seat("2026-09-28", "11:15"), seat("2026-09-28", "11:00")]);
    expect(g.days.map((d) => d.day)).toEqual(["2026-09-28", "2026-09-29"]);
    const mon = g.days[0];
    expect(mon.periods.map((p) => p.period)).toEqual(["Morning", "Afternoon"]);
    expect(mon.periods[0].slots.map((s) => s.session.starts_at)).toEqual(["11:00", "11:15"]);
  });

  it("names the room once when every session shares it, and not at all when they differ", () => {
    expect(sessionGrid([seat("2026-09-28", "11:00"), seat("2026-09-28", "11:15")]).location).toBe("Gardensby17");
    expect(sessionGrid([seat("2026-09-28", "11:00"), seat("2026-09-28", "11:15", { location: "Hall B" })]).location).toBeNull();
  });

  it("gives a shared length only when every session has the same one", () => {
    expect(sessionGrid([seat("2026-09-28", "11:00"), seat("2026-09-28", "11:15")]).minutes).toBe(15);
    expect(sessionGrid([seat("2026-09-28", "11:00"), seat("2026-09-28", "12:00", { ends_at: "13:00" })]).minutes).toBeNull();
    expect(sessionGrid([seat("2026-09-28", "11:00", { ends_at: null })]).minutes).toBeNull();
  });

  it("marks the days holding the attendee's seat and the days with room left", () => {
    const g = sessionGrid([
      seat("2026-09-28", "11:00", {}, { mine: true }),
      seat("2026-09-29", "11:00", {}, { full: true, left: 0 }),
    ]);
    expect(g.days.map((d) => [d.mine, d.open])).toEqual([[true, false], [false, false]]);
  });

  it("returns no days for an activity with no sessions", () => {
    expect(sessionGrid([])).toEqual({ days: [], location: null, minutes: null });
  });
});

describe("startDay", () => {
  it("opens on the day of the attendee's own seat", () => {
    const g = sessionGrid([seat("2026-09-28", "11:00"), seat("2026-09-29", "11:00", {}, { mine: true })]);
    expect(startDay(g.days)).toBe("2026-09-29");
  });

  it("otherwise opens on the first day with room left", () => {
    const g = sessionGrid([seat("2026-09-28", "11:00", {}, { full: true, left: 0 }), seat("2026-09-29", "11:00")]);
    expect(startDay(g.days)).toBe("2026-09-29");
  });

  it("falls back to the first day when everything is full", () => {
    const g = sessionGrid([seat("2026-09-28", "11:00", {}, { full: true, left: 0 })]);
    expect(startDay(g.days)).toBe("2026-09-28");
    expect(startDay([])).toBeNull();
  });
});
