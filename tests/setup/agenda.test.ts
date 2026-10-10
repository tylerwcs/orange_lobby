import { describe, expect, it } from "vitest";
import {
  agendaErrors, agendaFromLive, agendaMissing, agendaProblems, agendaRange, errorKey, previewAgenda, restrictSeed, sanitizeAgenda, seedIdsOf,
  type AgendaAnswers,
} from "@/features/setup/sections/agenda";
import { day, item, session } from "./fixtures";

const range = { first: "2027-01-10", last: "2027-01-11" };
const answers = (o: Partial<AgendaAnswers> = {}): AgendaAnswers => ({
  days: [{ id: "d1", date: "2027-01-10", name: "" }],
  sessions: [session("s1", "d1", { title: "Keynote" })],
  ...o,
});

describe("sanitizeAgenda", () => {
  it("keeps known fields as strings, cut to their limits", () => {
    const a = sanitizeAgenda({
      days: [{ id: "d1", date: "2027-01-10", name: "x".repeat(99), evil: 1 }],
      sessions: [{ id: "s1", day: "d1", title: "t".repeat(500), starts_at: "09:00", image_url: "https://x", round: "R" }],
    });
    expect(a.days[0]).toEqual({ id: "d1", date: "2027-01-10", name: "x".repeat(60) });
    expect(a.sessions[0].title).toHaveLength(160);
    expect(Object.keys(a.sessions[0]).sort()).toEqual(["day", "description", "ends_at", "id", "location", "starts_at", "title"]);
  });
  it("drops repeated or malformed ids, and sessions whose day is gone", () => {
    const a = sanitizeAgenda({
      days: [{ id: "d1", date: "" }, { id: "d1", date: "" }, { id: "bad id!", date: "" }],
      sessions: [{ id: "s1", day: "d1" }, { id: "s2", day: "nope" }, { id: "s1", day: "d1" }],
    });
    expect(a.days.map((d) => d.id)).toEqual(["d1"]);
    expect(a.sessions.map((s) => s.id)).toEqual(["s1"]);
  });
  it("reads anything that isn't an object as blank", () => {
    expect(sanitizeAgenda(null)).toEqual({ days: [], sessions: [] });
    expect(sanitizeAgenda([1])).toEqual({ days: [], sessions: [] });
  });
});

describe("agendaFromLive (D453, D454)", () => {
  const days = [day("D1", "2027-01-10", "Day 1")];
  const items = [
    item({ id: "I2", day_id: "D1", starts_at: "10:00", title: "Talk", sort_order: 20, categories: ["Staff"], image_url: "https://x/p.png" }),
    item({ id: "I1", day_id: "D1", starts_at: "09:00", title: "Keynote", sort_order: 10, location: "Hall" }),
    item({ id: "P1", day_id: "D1", kind: "image", starts_at: null, title: "", image_url: "https://x/p.png", sort_order: 30 }),
    item({ id: "R1", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3A", sort_order: 40 }),
  ];
  const { answers: a, map } = agendaFromLive(days, items);

  it("keeps real ids, so the map is the identity", () => {
    expect(a.days).toEqual([{ id: "D1", date: "2027-01-10", name: "Day 1" }]);
    expect(map).toEqual({ D1: "D1", I1: "I1", I2: "I2" });
  });
  it("lists sessions in agenda order, and leaves image rows and breakout rounds to admin", () => {
    expect(a.sessions.map((s) => s.id)).toEqual(["I1", "I2"]);
    expect(a.sessions[0]).toEqual({ id: "I1", day: "D1", starts_at: "09:00", ends_at: "", title: "Keynote", location: "Hall", description: "" });
  });
  it("restrictSeed keeps only what the form showed", () => {
    const r = restrictSeed({ answers: a, map }, ["D1", "I1"]);
    expect(r.answers.sessions.map((s) => s.id)).toEqual(["I1"]);
    expect(r.map).toEqual({ D1: "D1", I1: "I1" });
    // A session whose day the form didn't show goes too.
    expect(restrictSeed({ answers: a, map }, ["I1"])).toEqual({ answers: { days: [], sessions: [] }, map: {} });
  });
  it("seedIdsOf lists every day and session id", () => {
    expect(seedIdsOf(a)).toEqual(["D1", "I1", "I2"]);
  });
});

describe("agendaRange (D457)", () => {
  const ev = { starts_on: "2027-01-10", ends_on: "2027-01-11" };
  it("uses the organiser's Basics dates when both are dates", () => {
    expect(agendaRange({ starts_on: "2027-02-01", ends_on: "2027-02-02" }, ev)).toEqual({ first: "2027-02-01", last: "2027-02-02" });
  });
  it("else the live event's", () => {
    expect(agendaRange({ starts_on: "", ends_on: "2027-02-02" }, ev)).toEqual({ first: "2027-01-10", last: "2027-01-11" });
    expect(agendaRange(null, { starts_on: null, ends_on: null })).toEqual({ first: null, last: null });
  });
});

describe("agendaErrors", () => {
  it("passes a good agenda", () => {
    expect(agendaErrors(answers(), range)).toEqual({});
  });
  it("checks day dates: real, one day per date, inside the event", () => {
    const e = agendaErrors(answers({
      days: [
        { id: "d1", date: "2027-02-30", name: "" }, { id: "d2", date: "2027-01-11", name: "" },
        { id: "d3", date: "2027-01-11", name: "" }, { id: "d4", date: "2027-01-12", name: "" },
      ],
      sessions: [],
    }), range);
    expect(e[errorKey("d1", "date")]).toBe("Pick a date.");
    expect(e[errorKey("d2", "date")]).toBe("Another day already has this date.");
    expect(e[errorKey("d4", "date")]).toMatch(/^Outside the event dates/);
  });
  it("checks times, and that the end is after the start", () => {
    const e = agendaErrors(answers({
      sessions: [session("s1", "d1", { starts_at: "9am" }), session("s2", "d1", { starts_at: "10:00", ends_at: "09:30" })],
    }), range);
    expect(e[errorKey("s1", "starts_at")]).toBe("Use a time like 09:30.");
    expect(e[errorKey("s2", "ends_at")]).toBe("The end must be after the start.");
  });
  it("checks nothing against dates it doesn't know", () => {
    expect(agendaErrors(answers({ days: [{ id: "d1", date: "2030-01-01", name: "" }] }), { first: null, last: null })).toEqual({});
  });
});

describe("agendaMissing and agendaProblems", () => {
  it("asks for a day, then sessions, then what each session needs", () => {
    expect(agendaMissing({ days: [], sessions: [] })).toEqual(["Add at least one day."]);
    expect(agendaMissing(answers({ sessions: [] }))).toEqual(["Day 1 has no sessions yet."]);
    expect(agendaMissing(answers({ sessions: [session("s1", "d1", { starts_at: "", title: "" })] })))
      .toEqual(["Day 1: a session needs a start time.", "Day 1: a session needs a title."]);
    expect(agendaMissing(answers({ days: [{ id: "d1", date: "", name: "Gala" }] }))).toEqual(["Gala needs a date."]);
  });
  it("names where each error is", () => {
    const p = agendaProblems(answers({ days: [{ id: "d1", date: "2027-01-12", name: "Gala" }] }), range);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^Gala: Outside the event dates/);
    expect(agendaProblems(answers({ sessions: [session("s1", "d1", { title: "Keynote", ends_at: "08:00" })] }), range))
      .toEqual(["Day 1: Keynote: The end must be after the start."]);
  });
});

describe("previewAgenda (D445, D456)", () => {
  it("shows each day's sessions in time order, ties in the form's order", () => {
    const p = previewAgenda(answers({
      sessions: [session("a", "d1", { starts_at: "10:00", title: "A" }), session("b", "d1", { starts_at: "09:00", title: "B" }), session("c", "d1", { starts_at: "10:00", title: "C" })],
    }));
    expect(p.items.map((i) => i.title)).toEqual(["B", "A", "C"]);
    expect(p.days).toEqual([{ id: "d1", date: "2027-01-10", name: null }]);
  });
  it("skips days without a usable date", () => {
    expect(previewAgenda(answers({ days: [{ id: "d1", date: "", name: "" }] })).days).toEqual([]);
  });
});
