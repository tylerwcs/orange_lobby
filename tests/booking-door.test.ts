import { describe, it, expect } from "vitest";
import { boardsByDay, doorBoard, doorSessions, doorTallies, slotEnds, slotPhases, slotTime } from "@/lib/booking-door";
import type { ActivitySession } from "@/lib/types";

const DAY = "2026-09-30";
const s = (id: string, starts_at: string, ends_at: string | null = null, extra: Partial<ActivitySession> = {}): ActivitySession =>
  ({ id, event_id: "e1", activity_id: "a1", day: DAY, starts_at, ends_at, location: null, capacity: 3, sort_order: 0, ...extra });
const b = (session_id: string, attendee_id: string) => ({ session_id, attendee_id });
const scan = (attendee_id: string, scanned_at: string, checkpoint_id = "d1") => ({ attendee_id, scanned_at, checkpoint_id });
const at = (time: string, date = DAY) => ({ date, time });
const names = new Map([["p1", "Aisyah"], ["p2", "Ben"], ["p3", "Chen"], ["w1", "Walker"]]);
const quarterHours = [s("s1", "10:00", "10:15"), s("s2", "10:15", "10:30"), s("s3", "10:30", "10:45")];
const phases = (sessions: ActivitySession[], now: { date: string; time: string }, day = DAY) =>
  Object.fromEntries(slotPhases(sessions, day, now));

describe("slotTime", () => {
  it("shows start and end", () => expect(slotTime({ starts_at: "10:30", ends_at: "10:45" })).toBe("10:30–10:45"));
  it("shows the start alone when there is no end", () => expect(slotTime({ starts_at: "10:30", ends_at: null })).toBe("10:30"));
});

describe("slotEnds (D330)", () => {
  it("uses a slot's own end", () => expect(slotEnds([s("s1", "10:00", "10:15")]).get("s1")).toBe("10:15"));
  it("without an end, a slot ends when the next one that day starts", () => {
    const ends = slotEnds([s("s1", "10:00"), s("s2", "10:30"), s("s3", "10:30")]);
    expect(ends.get("s1")).toBe("10:30");
  });
  it("the last slot with no end stays open", () => {
    expect(slotEnds([s("s1", "10:00"), s("s2", "10:30")]).get("s2")).toBeNull();
  });
});

describe("doorSessions", () => {
  const all = [s("s2", "11:00"), s("s1", "10:00"), s("x", "10:00", null, { activity_id: "a2" }), s("y", "10:00", null, { day: "2026-10-01" })];
  it("keeps the door's activity on the door's day, in time order", () => {
    expect(doorSessions({ activity_id: "a1", day: DAY }, all).map((x) => x.id)).toEqual(["s1", "s2"]);
  });
  it("is empty for an ordinary door", () => expect(doorSessions({ activity_id: null, day: DAY }, all)).toEqual([]));
});

describe("slotPhases", () => {
  it("before the first slot: the first is next, the rest later", () => {
    expect(phases(quarterHours, at("09:50"))).toEqual({ s1: "next", s2: "later", s3: "later" });
  });
  it("mid-slot: ended slots are earlier, the running one now, the following one next", () => {
    expect(phases(quarterHours, at("10:20"))).toEqual({ s1: "earlier", s2: "now", s3: "next" });
  });
  it("on a boundary the old slot has ended and the new one is running", () => {
    expect(phases(quarterHours, at("10:15"))).toEqual({ s1: "earlier", s2: "now", s3: "next" });
  });
  it("in a gap there is no now, only next", () => {
    expect(phases([s("s1", "10:00", "10:15"), s("s2", "11:00", "11:15")], at("10:30"))).toEqual({ s1: "earlier", s2: "next" });
  });
  it("after the last slot everything is earlier", () => {
    expect(phases(quarterHours, at("11:00"))).toEqual({ s1: "earlier", s2: "earlier", s3: "earlier" });
  });
  it("parallel slots share a phase", () => {
    const parallel = [s("s1", "10:00", "10:15"), s("s2", "10:00", "10:15")];
    expect(phases(parallel, at("09:00"))).toEqual({ s1: "next", s2: "next" });
    expect(phases(parallel, at("10:05"))).toEqual({ s1: "now", s2: "now" });
  });
  it("a slot with no end runs until the next starts; the last runs all day", () => {
    const open = [s("s1", "10:00"), s("s2", "10:30")];
    expect(phases(open, at("10:20"))).toEqual({ s1: "now", s2: "next" });
    expect(phases(open, at("23:00"))).toEqual({ s1: "earlier", s2: "now" });
  });
  it("a door dated before today is all earlier; after today all later", () => {
    expect(phases(quarterHours, at("10:20", "2026-10-01"))).toEqual({ s1: "earlier", s2: "earlier", s3: "earlier" });
    expect(phases(quarterHours, at("10:20", "2026-09-29"))).toEqual({ s1: "later", s2: "later", s3: "later" });
  });
});

describe("doorBoard", () => {
  const board = doorBoard({
    day: DAY,
    sessions: quarterHours,
    bookings: [b("s1", "p2"), b("s1", "p1"), b("s2", "p3"), b("other", "p9")],
    checkins: [scan("p1", "2026-09-30T02:02:00+00:00"), scan("w1", "2026-09-30T02:05:00+00:00")],
    names,
    now: at("10:20"),
  });

  it("lists each slot's bookers by name with their phase and time", () => {
    expect(board.slots.map((x) => [x.id, x.time, x.phase, x.people.map((p) => p.name)])).toEqual([
      ["s1", "10:00–10:15", "earlier", ["Aisyah", "Ben"]],
      ["s2", "10:15–10:30", "now", ["Chen"]],
      ["s3", "10:30–10:45", "next", []],
    ]);
  });
  it("a booker with no arrival in an ended slot is a no-show; in a running slot they are not", () => {
    const [s1, s2] = board.slots;
    expect(s1.people.map((p) => [p.name, p.arrivedAt, p.noShow])).toEqual([
      ["Aisyah", "2026-09-30T02:02:00+00:00", false],
      ["Ben", null, true],
    ]);
    expect(s1.arrived).toBe(1);
    expect(s1.noShows).toBe(1);
    expect(s2.people[0].noShow).toBe(false);
  });
  it("counts booked arrivals over bookers and keeps walk-ins apart (D331)", () => {
    expect(board.arrived).toBe(1);
    expect(board.expected).toBe(3);
    expect(board.walkIns).toEqual([{ id: "w1", name: "Walker", at: "2026-09-30T02:05:00+00:00" }]);
  });
  it("takes the earliest arrival and names an unknown attendee", () => {
    const b2 = doorBoard({
      day: DAY, sessions: [s("s1", "10:00", "10:15")], bookings: [b("s1", "zz")],
      checkins: [scan("zz", "2026-09-30T02:09:00+00:00"), scan("zz", "2026-09-30T02:01:00+00:00")],
      names, now: at("10:05"),
    });
    expect(b2.slots[0].people).toEqual([{ id: "zz", name: "Unknown", arrivedAt: "2026-09-30T02:01:00+00:00", noShow: false }]);
  });
});

describe("doorTallies", () => {
  const sessions = [s("s1", "10:00", "10:15"), s("s9", "10:00", "10:15", { day: "2026-10-01" })];
  const bookings = [b("s1", "p1"), b("s1", "p2"), b("s9", "p3")];
  const checkins = [
    { checkpoint_id: "reg", attendee_id: "p1" }, { checkpoint_id: "reg", attendee_id: "p3" },
    { checkpoint_id: "d1", attendee_id: "p1" }, { checkpoint_id: "d1", attendee_id: "w1" },
  ];
  const doors = [{ id: "reg", activity_id: null, day: DAY }, { id: "d1", activity_id: "a1", day: DAY }, { id: "empty", activity_id: "a1", day: "2026-10-02" }];
  const t = doorTallies(doors, checkins, sessions, bookings, 120);

  it("an ordinary door counts every check-in against everyone registered", () => {
    expect(t.reg).toEqual({ arrived: 2, expected: 120, walkIns: 0 });
  });
  it("a booking door counts that day's bookers only, with walk-ins apart", () => {
    expect(t.d1).toEqual({ arrived: 1, expected: 2, walkIns: 1 });
  });
  it("a booking door on a day without sessions expects nobody", () => {
    expect(t.empty).toEqual({ arrived: 0, expected: 0, walkIns: 0 });
  });
});

describe("boardsByDay", () => {
  it("builds a board only for days with a door, and merges two doors on one day", () => {
    const sessions = [s("s1", "10:00", "10:15"), s("s9", "10:00", "10:15", { day: "2026-10-01" })];
    const boards = boardsByDay(
      "a1",
      [{ id: "d1", activity_id: "a1", day: DAY }, { id: "d2", activity_id: "a1", day: DAY }, { id: "reg", activity_id: null, day: DAY }],
      [
        { checkpoint_id: "d1", attendee_id: "p1", scanned_at: "2026-09-30T02:02:00+00:00" },
        { checkpoint_id: "d2", attendee_id: "p2", scanned_at: "2026-09-30T02:03:00+00:00" },
        { checkpoint_id: "reg", attendee_id: "p3", scanned_at: "2026-09-30T01:00:00+00:00" },
      ],
      sessions,
      [b("s1", "p1"), b("s1", "p2"), b("s9", "p3")],
      names,
      at("12:00"),
    );
    expect([...boards.keys()]).toEqual([DAY]);
    expect(boards.get(DAY)!.arrived).toBe(2);
    expect(boards.get(DAY)!.walkIns).toEqual([]);
  });
});
