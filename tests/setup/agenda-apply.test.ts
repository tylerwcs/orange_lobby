import { describe, expect, it } from "vitest";
import { agendaFromLive, blankAgenda, type AgendaAnswers, type AgendaMap } from "@/features/setup/sections/agenda";
import { agendaBaseline, planAgenda, type AgendaLive } from "@/features/setup/sections/agenda-apply";
import { changeSummary, RESTORED } from "@/features/setup/sections/changes";
import type { AgendaDay, AgendaItem } from "@/lib/types";
import { shortDate } from "@/lib/text";
import { counter, day, item, session } from "./fixtures";

const live = (days: AgendaDay[], items: AgendaItem[]): AgendaLive => ({ days, items });
const plan = (S: AgendaAnswers, B: AgendaAnswers, map: AgendaMap, l: AgendaLive) => planAgenda({ submitted: S, baseline: B, map, live: l, newId: counter() });
/** The live agenda as the organiser's starting point: their baseline and map at once. */
const seeded = (l: AgendaLive) => agendaFromLive(l.days, l.items);
const NOTHING = { insert: [], update: [], delete: [] };

const L = live([day("D1", "2027-01-10")], [item({ id: "I1", day_id: "D1", title: "Keynote", sort_order: 10 })]);

describe("agendaBaseline (D450)", () => {
  const a = { days: [{ id: "a", date: "2027-01-10", name: "" }], sessions: [] };
  const s = { days: [{ id: "s", date: "2027-01-10", name: "" }], sessions: [] };
  it("prefers the last applied version, then the starting point, else nothing", () => {
    expect(agendaBaseline({ applied: a, seed: s }).days[0].id).toBe("a");
    expect(agendaBaseline({ applied: null, seed: s }).days[0].id).toBe("s");
    expect(agendaBaseline(null)).toEqual(blankAgenda());
  });
});

describe("planAgenda (D450, D455, D456)", () => {
  it("first Apply onto an empty agenda creates the days and sessions, placed by time", () => {
    const S: AgendaAnswers = {
      days: [{ id: "d1", date: "2027-01-10", name: "Day 1" }],
      sessions: [session("s1", "d1", { starts_at: "10:00", title: "Lunch" }), session("s2", "d1", { starts_at: "09:00", title: "Keynote" })],
    };
    const p = plan(S, blankAgenda(), {}, live([], []));
    expect(p.days.insert).toEqual([{ id: "n1", date: "2027-01-10", name: "Day 1" }]);
    expect(p.items.insert.map((i) => [i.id, i.title, i.day_id, i.sort_order])).toEqual([["n2", "Lunch", "n1", 20], ["n3", "Keynote", "n1", 10]]);
    expect(p.map).toEqual({ d1: "n1", s1: "n2", s2: "n3" });
    expect(changeSummary(p.changes)).toBe("1 day added · 2 sessions added");
    expect(p.problems).toEqual([]);
  });

  it("writes nothing when the organiser changed nothing", () => {
    const { answers, map } = seeded(L);
    const p = plan(answers, answers, map, L);
    expect([p.days, p.items, p.order, p.changes]).toEqual([NOTHING, NOTHING, [], []]);
    expect(p.map).toEqual(map);
  });

  it("writes only the fields the organiser changed, so an admin's edit to another field survives", () => {
    const { answers: B, map } = seeded(L);
    const now = live(L.days, [{ ...L.items[0], title: "Opening keynote", categories: ["VIP"], image_url: "https://x/p.png" }]);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], location: "Hall A" }] }, B, map, now);
    expect(p.items.update).toEqual([{ id: "I1", location: "Hall A" }]);
    expect(p.changes).toEqual([{ what: "session", how: "changed", label: "Keynote", lines: ["Location: empty → Hall A"] }]);
  });

  it("skips a change the live agenda already has, so the review lists exactly what Apply writes", () => {
    const { answers: B, map } = seeded(L);
    const now = live(L.days, [{ ...L.items[0], title: "Opening keynote" }]);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], title: "Opening keynote" }] }, B, map, now);
    expect(p.items.update).toEqual([]);
    expect(p.changes).toEqual([]);
  });

  it("a session the admin deleted stays deleted while the organiser leaves it alone", () => {
    const { answers: B, map } = seeded(L);
    const p = plan(B, B, map, live(L.days, []));
    expect(p.items.insert).toEqual([]);
    expect(p.map.I1).toBe("I1");
  });

  it("comes back when the organiser changes it again", () => {
    const { answers: B, map } = seeded(L);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], title: "Keynote 2" }] }, B, map, live(L.days, []));
    expect(p.items.insert).toMatchObject([{ id: "n1", title: "Keynote 2", day_id: "D1" }]);
    expect(p.map.I1).toBe("n1");
    expect(p.changes[0]).toMatchObject({ what: "session", how: "added" });
    expect(p.changes[0].lines).toContain(RESTORED);
  });

  it("deletes a session the organiser removed", () => {
    const { answers: B, map } = seeded(L);
    const p = plan({ ...B, sessions: [] }, B, map, L);
    expect(p.items.delete).toEqual(["I1"]);
    expect(p.map).toEqual({ D1: "D1" });
  });

  it("a new day on a date the admin already has uses that day", () => {
    const S = { days: [{ id: "d9", date: "2027-01-11", name: "Gala" }], sessions: [session("s1", "d9")] };
    const p = plan(S, blankAgenda(), {}, live([day("D2", "2027-01-11")], []));
    expect(p.days.insert).toEqual([]);
    expect(p.days.update).toEqual([{ id: "D2", name: "Gala" }]);
    expect(p.items.insert[0].day_id).toBe("D2");
    expect(p.map.d9).toBe("D2");
  });

  it("removes a day only when nothing the admin added is on it", () => {
    const { answers: B, map } = seeded(L);
    const empty = { days: [], sessions: [] };
    expect(plan(empty, B, map, L).days.delete).toEqual(["D1"]);
    const withAdmin = live(L.days, [...L.items, item({ id: "A1", day_id: "D1", title: "Admin's" })]);
    const p = plan(empty, B, map, withAdmin);
    expect(p.days.delete).toEqual([]);
    expect(p.items.delete).toEqual(["I1"]);
    expect(p.changes.find((c) => c.what === "day")).toMatchObject({ how: "kept", lines: ["Not removed: 1 item was added in admin."] });
  });

  it("leaves breakout rounds, which are admin's, alone (D453)", () => {
    const L5 = live([day("D1", "2027-01-10")], [
      item({ id: "I1", day_id: "D1", title: "Keynote", sort_order: 10 }),
      item({ id: "R1", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3A", sort_order: 20 }),
      item({ id: "R2", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3B", sort_order: 20 }),
    ]);
    const { answers: B, map } = seeded(L5);
    expect(B.sessions.map((s) => s.id)).toEqual(["I1"]);
    const p = plan({ days: [], sessions: [] }, B, map, L5);
    expect(p.items.delete).toEqual(["I1"]);
    expect(p.days.delete).toEqual([]);
    expect(p.changes.find((c) => c.what === "day")?.lines).toEqual(["Not removed: 2 items were added in admin."]);
  });

  it("re-places a retimed session by its new time and leaves the rest in hand order", () => {
    const L4 = live([day("D1", "2027-01-10")], [
      item({ id: "I1", day_id: "D1", starts_at: "09:00", sort_order: 10 }),
      item({ id: "I2", day_id: "D1", starts_at: "10:00", sort_order: 20 }),
      item({ id: "I3", day_id: "D1", starts_at: "11:00", sort_order: 30 }),
    ]);
    const { answers: B, map } = seeded(L4);
    const S = { ...B, sessions: B.sessions.map((s) => (s.id === "I1" ? { ...s, starts_at: "10:30" } : s)) };
    const p = plan(S, B, map, L4);
    expect(p.items.update).toEqual([{ id: "I1", starts_at: "10:30" }]);
    expect(p.order).toEqual([{ id: "I2", sort_order: 10 }, { id: "I1", sort_order: 20 }]);
  });

  it("moves a session to another day", () => {
    const L6 = live([day("D1", "2027-01-10"), day("D2", "2027-01-11")], [item({ id: "I1", day_id: "D1", title: "Keynote" })]);
    const { answers: B, map } = seeded(L6);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], day: "D2" }] }, B, map, L6);
    expect(p.items.update).toEqual([{ id: "I1", day_id: "D2" }]);
    expect(p.order).toEqual([]);
    expect(p.changes[0].lines[0]).toMatch(/^Day: /);
  });

  it("refuses two days on one date", () => {
    const L3 = live([day("D1", "2027-01-10"), day("D2", "2027-01-11")], []);
    // The organiser's form showed D1 only; the admin added D2 since.
    const B = { days: [{ id: "D1", date: "2027-01-10", name: "" }], sessions: [] };
    const p = plan({ days: [{ id: "D1", date: "2027-01-11", name: "" }], sessions: [] }, B, { D1: "D1" }, L3);
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]).toMatch(/^Two days would fall on /);
  });

  it("moves a session onto a day added in the same plan", () => {
    const { answers: B, map } = seeded(L);
    const S: AgendaAnswers = {
      days: [...B.days, { id: "dnew", date: "2027-01-11", name: "Gala" }],
      sessions: [{ ...B.sessions[0], day: "dnew" }],
    };
    const p = plan(S, B, map, L);
    expect(p.days.insert).toEqual([{ id: "n1", date: "2027-01-11", name: "Gala" }]);
    expect(p.items.update).toEqual([{ id: "I1", day_id: "n1" }]);
    expect(p.days.delete).toEqual([]);
    expect(p.map).toMatchObject({ dnew: "n1", I1: "I1" });
    expect(p.problems).toEqual([]);
  });

  it("places a new session among breakout rounds: rooms keep one order number, only later rows are renumbered", () => {
    const L7 = live([day("D1", "2027-01-10")], [
      item({ id: "I1", day_id: "D1", starts_at: "09:00", title: "Keynote", sort_order: 10 }),
      item({ id: "R1", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3A", sort_order: 20 }),
      item({ id: "R2", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3B", sort_order: 20 }),
      item({ id: "I3", day_id: "D1", starts_at: "16:00", title: "Closing", sort_order: 30 }),
    ]);
    const { answers: B, map } = seeded(L7);
    const S = { ...B, sessions: [...B.sessions, session("new", "D1", { starts_at: "10:00", title: "Coffee" })] };
    const p = plan(S, B, map, L7);
    expect(p.items.insert).toMatchObject([{ title: "Coffee", day_id: "D1", sort_order: 20 }]);
    // The keynote keeps 10; both rooms move together to 30; the closing follows at 40.
    expect(p.order).toEqual([{ id: "R1", sort_order: 30 }, { id: "R2", sort_order: 30 }, { id: "I3", sort_order: 40 }]);
  });

  it("writes a day's new date and new name together, each with its review line", () => {
    const L8 = live([day("D1", "2027-01-10", "Day 1")], []);
    const { answers: B, map } = seeded(L8);
    const p = plan({ days: [{ id: "D1", date: "2027-01-11", name: "Opening" }], sessions: [] }, B, map, L8);
    expect(p.days.update).toEqual([{ id: "D1", date: "2027-01-11", name: "Opening" }]);
    expect(p.changes).toEqual([{
      what: "day", how: "changed", label: "Opening",
      lines: [`Date: ${shortDate("2027-01-10")} → ${shortDate("2027-01-11")}`, "Name: Day 1 → Opening"],
    }]);
  });

  it("inserts a day the admin deleted again when the organiser renames it, with the restored note", () => {
    const { answers: B, map } = seeded(live([day("D1", "2027-01-10", "Day 1")], []));
    const gone = live([], []);
    const p = plan({ days: [{ id: "D1", date: "2027-01-10", name: "Opening" }], sessions: [] }, B, map, gone);
    expect(p.days.insert).toEqual([{ id: "n1", date: "2027-01-10", name: "Opening" }]);
    expect(p.days.update).toEqual([]);
    expect(p.changes).toEqual([{ what: "day", how: "added", label: "Opening", lines: [RESTORED] }]);
    expect(p.map.D1).toBe("n1");
  });

  it("adopts the live day when the organiser removes a day and adds another on the same date", () => {
    const { answers: B, map } = seeded(L);
    const S: AgendaAnswers = {
      days: [{ id: "d9", date: "2027-01-10", name: "" }],
      sessions: [session("s9", "d9", { title: "Welcome" })],
    };
    const p = plan(S, { days: B.days, sessions: [] }, map, L);
    expect(p.days).toEqual(NOTHING);
    expect(p.items.insert).toMatchObject([{ title: "Welcome", day_id: "D1" }]);
    expect(p.map.d9).toBe("D1");
    expect(p.problems).toEqual([]);
  });
});
