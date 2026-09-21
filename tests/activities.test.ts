import { describe, expect, it } from "vitest";
import {
  seatsFor, eligible, activityState, canCancel, unbookedIds, sessionRosters, unbookedByActivity,
  bookedAgendaRows, mergeAgenda, personalAgenda, isBookedRow, BOOKING_ROW_PREFIX,
  readActivityPolicy, readNewActivity, describePlacement, type ActivityFormFields,
} from "@/lib/activities";
import { visibleTo } from "@/lib/agenda";
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

describe("sessionRosters", () => {
  it("sorts each session's attendees into the roster's own order, not booking order", () => {
    // Bookings arrive attendee c, then a, then b - the reverse of the alphabetical attendeeIds
    // order listAttendees would hand this in. The output must follow the latter.
    const bookings = [
      { session_id: "s1", attendee_id: "c" },
      { session_id: "s1", attendee_id: "a" },
      { session_id: "s1", attendee_id: "b" },
    ];
    const byId = sessionRosters(["s1"], bookings, ["a", "b", "c"]);
    expect(byId.get("s1")).toEqual(["a", "b", "c"]);
  });

  it("gives a session with no bookings an empty list rather than dropping it", () => {
    const byId = sessionRosters(["s1", "s2"], [{ session_id: "s1", attendee_id: "a" }], ["a"]);
    expect(byId.has("s2")).toBe(true);
    expect(byId.get("s2")).toEqual([]);
  });
});

describe("unbookedByActivity", () => {
  const required = (id: string) => activity({ id, required: true });

  it("computes the not-booked list per activity rather than pooling across them", () => {
    // x has booked A but not B; if the computation pooled bookings across activities, x would
    // wrongly disappear from B's own list just for having booked something else.
    const activities = [required("A"), required("B")];
    const bookings = [{ activity_id: "A", attendee_id: "x" }];
    const out = unbookedByActivity(activities, bookings, ["x", "y"], () => null);
    expect(out.find((u) => u.activityId === "A")?.attendeeIds).toEqual(["y"]);
    expect(out.find((u) => u.activityId === "B")?.attendeeIds).toEqual(["x", "y"]);
  });

  it("skips activities that are not required", () => {
    const activities = [activity({ id: "A", required: false }), required("B")];
    const out = unbookedByActivity(activities, [], ["x"], () => null);
    expect(out.map((u) => u.activityId)).toEqual(["B"]);
  });

  it("excludes attendees outside the activity's categories", () => {
    const activities = [required("A")];
    Object.assign(activities[0], { categories: ["VIP"] });
    const category = new Map([["x", "VIP"], ["y", "Crew"]]);
    const out = unbookedByActivity(activities, [], ["x", "y"], (id) => category.get(id) ?? null);
    expect(out[0].attendeeIds).toEqual(["x"]);
  });
});

describe("bookedAgendaRows", () => {
  it("turns a booked session into an agenda row carrying its own time and place", () => {
    const [row] = bookedAgendaRows([session("s1")]);
    expect(row).toMatchObject({
      id: `${BOOKING_ROW_PREFIX}s1`, day: "2026-10-01", starts_at: "09:30", ends_at: "11:00",
      title: "s1", location: "Room 2A", slot: null, code: null,
    });
    // The field that makes the row personal (D133) — asserted on its own, not folded into the
    // toMatchObject above, so a regression that starts copying the session's categories fails
    // loudly here rather than silently passing every other assertion.
    expect(row.categories).toBeNull();
  });

  it("marks its rows and only its rows", () => {
    const [row] = bookedAgendaRows([session("s1")]);
    expect(isBookedRow(row)).toBe(true);
    expect(isBookedRow(item("x", "2026-10-01", "09:00"))).toBe(false);
  });

  // This is the test that actually encodes the design decision (D133): a derived row must
  // survive every filter, because it is already personal — this attendee's own booking, not
  // something a category restriction ever applied to. `categories: null` is the entire
  // mechanism; proving it merely equals null (above) doesn't prove it does its job, so this
  // runs a row through the real filter with a viewer category that would hide an ordinary
  // restricted item, and checks it is not dropped.
  it("keeps a derived row visible under a category filter that would hide a restricted item", () => {
    const [row] = bookedAgendaRows([session("s1")]);
    const restricted = item("r1", "2026-10-01", "09:00");
    const seen = visibleTo([row, { ...restricted, categories: ["VIP"] }], { category: "Staff", assignedItemIds: new Set() });
    expect(seen.map((i) => i.id)).toEqual([row.id]);
  });
});

describe("mergeAgenda", () => {
  it("interleaves derived rows by day and time", () => {
    const items = [item("i1", "2026-10-01", "09:00"), item("i2", "2026-10-01", "14:00")];
    const derived = bookedAgendaRows([session("s1", { starts_at: "11:30" })]);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual(["i1", `${BOOKING_ROW_PREFIX}s1`, "i2"]);
  });

  it("sorts across days, not only within one", () => {
    const items = [item("i1", "2026-10-02", "09:00")];
    const derived = bookedAgendaRows([session("s1", { day: "2026-10-01", starts_at: "18:00" })]);
    expect(mergeAgenda(items, derived).map((i) => i.id)).toEqual([`${BOOKING_ROW_PREFIX}s1`, "i1"]);
  });

  it("leaves the agenda untouched when nothing is booked", () => {
    const items = [item("i1", "2026-10-01", "09:00")];
    expect(mergeAgenda(items, [])).toEqual(items);
  });
});

describe("mergeAgenda called on an already-filtered list", () => {
  // Merely an edge case of mergeAgenda in isolation - an empty `items` behaves like any other
  // list. It does NOT prove anything about composing with visibleTo: bookedAgendaRows sets
  // categories: null and slot: null, so a derived row is immune to both of visibleTo's filters
  // no matter which side of the merge it runs on. See personalAgenda below for the real
  // composition and why the order is still worth keeping despite that immunity.
  it("keeps a booked row that no agenda item corresponds to", () => {
    const filtered: AgendaItem[] = [];
    const derived = bookedAgendaRows([session("s1")]);
    expect(mergeAgenda(filtered, derived).map((i) => i.id)).toEqual(["booking:s1"]);
  });
});

describe("readActivityPolicy", () => {
  const fields = (over: Partial<ActivityFormFields> = {}): ActivityFormFields => ({
    name: "Workshops", description: "", required: false, max_per_attendee: "1", categories: "", ...over,
  });

  it("shapes valid input, parsing categories and coercing the cap to a number", () => {
    expect(readActivityPolicy(fields({ description: "Pick a track", categories: "VIP, Staff" }))).toEqual({
      name: "Workshops", description: "Pick a track", required: false, max_per_attendee: 1,
      categories: ["VIP", "Staff"],
    });
  });

  it("rejects an empty (or blank) name", () => {
    expect(() => readActivityPolicy(fields({ name: "  " }))).toThrow("An activity needs a name");
  });

  it("rejects a cap outside 1..10, matching the database's check constraint", () => {
    expect(() => readActivityPolicy(fields({ max_per_attendee: "0" }))).toThrow(/whole number between 1 and 10/);
    expect(() => readActivityPolicy(fields({ max_per_attendee: "11" }))).toThrow(/whole number between 1 and 10/);
    expect(() => readActivityPolicy(fields({ max_per_attendee: "abc" }))).toThrow(/whole number between 1 and 10/);
  });

  // The regression this reader exists to prevent (see its doc comment): the settings form
  // has no booking_open field, so this must never read one back in — not even as `false` —
  // or a Save would silently undo whatever the toggle button last set.
  it("never returns a booking_open key, absent rather than false", () => {
    const policy = readActivityPolicy(fields());
    expect(policy).not.toHaveProperty("booking_open");
    expect(Object.keys(policy).sort()).toEqual(
      ["categories", "description", "max_per_attendee", "name", "required"].sort(),
    );
  });
});

describe("readNewActivity", () => {
  it("carries booking_open through as given — only the create form may set an initial value", () => {
    const fields = { name: "Workshops", description: "", required: false, max_per_attendee: "1", categories: "" };
    expect(readNewActivity({ ...fields, booking_open: true }).booking_open).toBe(true);
    expect(readNewActivity({ ...fields, booking_open: false }).booking_open).toBe(false);
  });

  it("still validates the shared policy fields", () => {
    const fields = { name: "", description: "", required: false, max_per_attendee: "1", categories: "" };
    expect(() => readNewActivity({ ...fields, booking_open: true })).toThrow("An activity needs a name");
  });
});

describe("describePlacement", () => {
  it("reports a clean placement in a positive tone", () => {
    expect(describePlacement(["ok", "ok", "ok"], "Workshop A")).toEqual({
      message: "3 placed in Workshop A.",
      tone: "ok",
    });
  });

  it("counts refusals separately and flags the tone as error", () => {
    expect(describePlacement(["ok", "ok", "full"], "Workshop A")).toEqual({
      message: "2 placed in Workshop A, 1 refused — the session is full.",
      tone: "error",
    });
  });

  it("groups every other outcome as 'could not be placed' rather than naming it", () => {
    expect(describePlacement(["ok", "closed", "ineligible", "missing"], "Workshop A")).toEqual({
      message: "1 placed in Workshop A, 3 could not be placed.",
      tone: "error",
    });
  });

  it("still reports zero placed rather than staying silent", () => {
    expect(describePlacement(["full", "full"], "Workshop A")).toEqual({
      message: "0 placed in Workshop A, 2 refused — the session is full.",
      tone: "error",
    });
  });
});

describe("personalAgenda", () => {
  // The one thing worth pinning here is the composition, not the ordering: a sibling item this
  // viewer's category cannot see is filtered out, while this viewer's own booking - which no
  // filter has anything to say about - comes through regardless. Reordering filter and merge
  // would not make this test fail (see the note on personalAgenda itself), so it is not a test
  // of the ordering decision; it is a test that the composed function actually filters AND
  // actually merges, which a refactor could still break independently of the ordering.
  it("filters a sibling item by category while keeping this attendee's own booking", () => {
    const visible = item("v1", "2026-10-01", "08:00");
    const restricted = { ...item("r1", "2026-10-01", "09:00"), categories: ["VIP"] };
    const booked = session("s1", { starts_at: "09:30" });
    const result = personalAgenda(
      [visible, restricted],
      { category: "Delegate", assignedItemIds: new Set() },
      [booked],
    );
    expect(result.map((i) => i.id)).toEqual(["v1", `${BOOKING_ROW_PREFIX}s1`]);
  });
});
