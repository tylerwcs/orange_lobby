import { describe, expect, it } from "vitest";
import {
  seatsFor, eligible, activityState, canCancel, unbookedIds,
  bookedAgendaRows, mergeAgenda, isBookedRow,
} from "@/lib/activities";
import type { Activity, ActivitySession, AgendaItem } from "@/lib/types";

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "Workshops", description: null,
  required: false, booking_open: true, max_per_attendee: 1, categories: null, sort_order: 0, ...over,
});
const session = (id: string, over: Partial<ActivitySession> = {}): ActivitySession => ({
  id, event_id: "e", activity_id: "act1", title: id, day: "2026-10-01", starts_at: "09:30",
  ends_at: "11:00", location: "Room 2A", capacity: 30, sort_order: 0, ...over,
});
const item = (id: string, day: string, starts_at: string): AgendaItem => ({
  id, event_id: "e", day, starts_at, ends_at: null, title: id, description: null, location: null,
  categories: null, slot: null, code: null, color: null, sort_order: 0,
});

describe("seatsFor", () => {
  it("reports what is left", () => {
    expect(seatsFor(session("s1"), 18)).toEqual({ session: session("s1"), booked: 18, left: 12, full: false });
  });

  it("is full at capacity", () => {
    expect(seatsFor(session("s1", { capacity: 30 }), 30).full).toBe(true);
  });

  // An organiser can lower a capacity below what is already booked. The card must not
  // offer minus two seats, and it must certainly not offer a Book button.
  it("never reports negative seats when capacity was lowered under the bookings", () => {
    const s = seatsFor(session("s1", { capacity: 10 }), 12);
    expect(s.left).toBe(0);
    expect(s.full).toBe(true);
  });
});

describe("eligible", () => {
  it("lets everyone into an activity with no categories", () => {
    expect(eligible(activity({ categories: null }), null)).toBe(true);
    expect(eligible(activity({ categories: [] }), null)).toBe(true);
  });

  it("matches a category ignoring case and surrounding space", () => {
    expect(eligible(activity({ categories: ["VIP"] }), " vip ")).toBe(true);
  });

  it("keeps out an attendee with no category when the activity names one", () => {
    expect(eligible(activity({ categories: ["VIP"] }), null)).toBe(false);
  });
});

describe("activityState", () => {
  const sessions = [session("s1"), session("s2", { starts_at: "11:30" })];

  it("marks the sessions this attendee holds", () => {
    const state = activityState({
      activity: activity(), sessions, counts: { s1: 5, s2: 0 },
      mine: new Set(["s1"]), category: null,
    });
    expect(state.sessions.map((s) => s.mine)).toEqual([true, false]);
    expect(state.held).toBe(1);
  });

  it("stops offering seats once the per-activity cap is reached", () => {
    const state = activityState({
      activity: activity({ max_per_attendee: 1 }), sessions, counts: {},
      mine: new Set(["s1"]), category: null,
    });
    expect(state.canBookMore).toBe(false);
  });

  it("allows a second booking when the activity allows two", () => {
    const state = activityState({
      activity: activity({ max_per_attendee: 2 }), sessions, counts: {},
      mine: new Set(["s1"]), category: null,
    });
    expect(state.canBookMore).toBe(true);
  });

  it("is closed when the organiser has not opened booking", () => {
    const state = activityState({
      activity: activity({ booking_open: false }), sessions, counts: {},
      mine: new Set(), category: null,
    });
    expect(state.canBookMore).toBe(false);
    expect(state.closed).toBe(true);
  });

  // Required is satisfied by one booking, never by max_per_attendee of them (D129).
  it("asks a required activity to be picked once, however many are allowed", () => {
    const two = { activity: activity({ required: true, max_per_attendee: 2 }), sessions, counts: {}, category: null };
    expect(activityState({ ...two, mine: new Set() }).mustPick).toBe(true);
    expect(activityState({ ...two, mine: new Set(["s1"]) }).mustPick).toBe(false);
  });

  it("hides an activity the attendee's category cannot see", () => {
    const state = activityState({
      activity: activity({ categories: ["VIP"] }), sessions, counts: {},
      mine: new Set(), category: "Delegate",
    });
    expect(state.eligible).toBe(false);
  });
});

describe("canCancel", () => {
  it("lets anyone leave an optional activity", () => {
    expect(canCancel(activity({ required: false }), 1)).toBe(true);
  });

  it("refuses the last booking of a required activity", () => {
    expect(canCancel(activity({ required: true }), 1)).toBe(false);
  });

  it("allows dropping a second booking of a required activity", () => {
    expect(canCancel(activity({ required: true }), 2)).toBe(true);
  });
});

describe("unbookedIds", () => {
  it("lists the eligible people who hold nothing, in the order given", () => {
    expect(unbookedIds(["a1", "a2", "a3"], () => true, new Set(["a2"]))).toEqual(["a1", "a3"]);
  });

  it("leaves out people the activity was never open to", () => {
    expect(unbookedIds(["a1", "a2"], (id) => id === "a1", new Set())).toEqual(["a1"]);
  });
});

describe("bookedAgendaRows", () => {
  it("turns a booked session into an agenda row carrying its own time and place", () => {
    const [row] = bookedAgendaRows([session("s1")]);
    expect(row).toMatchObject({
      id: "booking:s1", day: "2026-10-01", starts_at: "09:30", ends_at: "11:00",
      title: "s1", location: "Room 2A", slot: null, code: null,
    });
  });

  it("marks its rows and only its rows", () => {
    const [row] = bookedAgendaRows([session("s1")]);
    expect(isBookedRow(row)).toBe(true);
    expect(isBookedRow(item("x", "2026-10-01", "09:00"))).toBe(false);
  });
});

describe("mergeAgenda", () => {
  it("interleaves derived rows by day and time", () => {
    const items = [item("i1", "2026-10-01", "09:00"), item("i2", "2026-10-01", "14:00")];
    const derived = bookedAgendaRows([session("s1", { starts_at: "11:30" })]);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual(["i1", "booking:s1", "i2"]);
  });

  it("sorts across days, not only within one", () => {
    const items = [item("i1", "2026-10-02", "09:00")];
    const derived = bookedAgendaRows([session("s1", { day: "2026-10-01", starts_at: "18:00" })]);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual(["booking:s1", "i1"]);
  });

  it("leaves the agenda untouched when nothing is booked", () => {
    const items = [item("i1", "2026-10-01", "09:00")];
    expect(mergeAgenda(items, [])).toEqual(items);
  });
});
