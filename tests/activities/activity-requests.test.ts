import { describe, expect, it } from "vitest";
import { pendingFor, lastDeclinedFor, activityControls, pendingCountByActivity, requestsAtDoor, requestStatusLabel } from "@/features/activities/lib/activity-requests";
import { activityState } from "@/features/activities/lib/activities";
import type { Activity, ActivityChangeRequest, ActivitySession } from "@/lib/types";

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "Workshops", description: null,
  kind: "booking", required: false, is_open: true, pinned: false, attendee_edit: false, show_leaderboard: true, health_data: false, proxy_fields: [], max_per_attendee: 1, categories: null,
  questions: [], per_day: false, group_mode: "off", group_target: null, scoring: null, image_url: null, starts_on: null, ends_on: null, venue: null, venue_url: null, action_label: null, stamps_required: null, reward_message: null, sort_order: 0, ...over,
});
const session = (id: string, over: Partial<ActivitySession> = {}): ActivitySession => ({
  // A start time per id ("s1" at 10:30, "s2" at 11:30), so each session's label is its own.
  id, event_id: "e", activity_id: "act1", day: "2026-10-01", starts_at: `${9 + (Number(id.replace(/\D/g, "")) || 0)}:30`.padStart(5, "0"),
  ends_at: "11:00", location: "Room 2A", location_url: null, capacity: 30, sort_order: 0, ...over,
});
const request = (over: Partial<ActivityChangeRequest> = {}): ActivityChangeRequest => ({
  id: "req1", event_id: "e", activity_id: "act1", attendee_id: "att1", kind: "switch",
  from_session_id: "s1", to_session_id: "s2", status: "pending",
  created_at: "2026-09-21T02:00:00Z", decided_at: null, decided_by: null, reminded_at: null, ...over,
});
const state = (over: { activity?: Activity; mine?: string[]; counts?: Record<string, number> } = {}) =>
  activityState({
    activity: over.activity ?? activity(),
    sessions: [session("s1"), session("s2", { starts_at: "11:30" })],
    counts: over.counts ?? {},
    mine: new Set(over.mine ?? []),
    category: null,
  });
// Before either session starts (D842 takes started sessions off the offer), so these tests
// do not depend on today's date.
const BEFORE = { date: "2026-10-01", time: "09:00" };
const ctl = (s: ReturnType<typeof state>, p: ActivityChangeRequest | null, dcl: ActivityChangeRequest | null = null) =>
  activityControls(s, p, dcl, "en", BEFORE);

describe("pendingFor", () => {
  it("finds this activity's open request", () => {
    const rs = [request({ id: "other", activity_id: "act2" }), request()];
    expect(pendingFor(rs, "act1")?.id).toBe("req1");
  });

  it("ignores a decided request", () => {
    expect(pendingFor([request({ status: "approved" })], "act1")).toBeNull();
    expect(pendingFor([request({ status: "declined" })], "act1")).toBeNull();
    expect(pendingFor([request({ status: "withdrawn" })], "act1")).toBeNull();
  });
});

describe("activityControls", () => {
  it("offers Book on a free session when nothing is held", () => {
    const c = ctl(state(), null);
    expect(c.bookable.map((s) => s.session.id)).toEqual(["s1", "s2"]);
    expect(c.held).toEqual([]);
    expect(c.switchTargets).toEqual([]);
    expect(c.canRequestCancel).toBe(false);
  });

  it("names the held session and offers the others as switch targets", () => {
    const c = ctl(state({ mine: ["s1"] }), null);
    expect(c.held.map((s) => s.session.id)).toEqual(["s1"]);
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
    expect(c.bookable).toEqual([]);
  });

  // An attendee at `max_per_attendee = 2` holding both sessions: every seat gets its own
  // controls, or one of them is stranded — its row reads "You are booked" with no action
  // anywhere on the page. `main` gave each held row its own Cancel, and D129's revision made
  // that a request rather than a removal; it did not take the second seat's control away.
  it("offers controls for every held seat, not just the first", () => {
    const twoSeats = { activity: activity({ max_per_attendee: 2 }), mine: ["s1", "s2"] };
    const c = ctl(state(twoSeats), null);
    expect(c.held.map((s) => s.session.id)).toEqual(["s1", "s2"]);
    expect(c.canRequestCancel).toBe(true);
    // Nothing is left to switch into: both sessions are theirs, and `switchTargets` excludes
    // every held session rather than only the one a control moves out of.
    expect(c.switchTargets).toEqual([]);
    expect(c.bookable).toEqual([]);
  });

  it("offers a third session as a switch target to an attendee holding two", () => {
    const c = ctl(
      activityState({
        activity: activity({ max_per_attendee: 2 }),
        sessions: [session("s1"), session("s2", { starts_at: "11:30" }), session("s3", { starts_at: "14:00" })],
        counts: {},
        mine: new Set(["s1", "s2"]),
        category: null,
      }),
      null,
    );
    expect(c.held.map((s) => s.session.id)).toEqual(["s1", "s2"]);
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s3"]);
  });

  // D148: a required activity's cancel never reaches the queue, so the control is absent.
  it("offers no cancel on a required activity", () => {
    expect(ctl(state({ activity: activity({ required: true }), mine: ["s1"] }), null).canRequestCancel).toBe(false);
    expect(ctl(state({ mine: ["s1"] }), null).canRequestCancel).toBe(true);
  });

  it("never offers a full session as a switch target", () => {
    const c = ctl(state({ mine: ["s1"], counts: { s2: 30 } }), null);
    expect(c.switchTargets).toEqual([]);
  });

  // D143 and §7.4: while a request is open, nothing that changes a seat is offered.
  it("withholds every control while a request is pending", () => {
    const c = ctl(state({ mine: ["s1"] }), request());
    expect(c.bookable).toEqual([]);
    expect(c.switchTargets).toEqual([]);
    expect(c.canRequestCancel).toBe(false);
    expect(c.pending).toEqual({ kind: "switch", fromLabel: "Thu 1 Oct · 10:30", toLabel: "Thu 1 Oct · 11:30" });
  });

  // A cap of one already makes bookable empty on its own (see the test above), so that test
  // alone cannot prove the pending branch is doing anything. This pair uses a cap of two,
  // the one configuration the rule exists for: an attendee who could still take a second
  // seat must not be offered it while a request about their first seat is open, because
  // taking it would change what the desk is being asked to decide. Deleting the pending
  // branch's `bookable: []` must fail the first of these two and pass the second.
  it("withholds Book while pending even when the cap would still allow another seat", () => {
    const twoSeats = { activity: activity({ max_per_attendee: 2 }), mine: ["s1"] };
    const c = ctl(state(twoSeats), request());
    expect(c.bookable).toEqual([]);
  });

  it("offers Book for that same cap-of-two attendee once nothing is pending", () => {
    const twoSeats = { activity: activity({ max_per_attendee: 2 }), mine: ["s1"] };
    const c = ctl(state(twoSeats), null);
    expect(c.bookable.map((s) => s.session.id)).toEqual(["s2"]);
  });

  it("summarises a pending cancel with no target", () => {
    const c = ctl(state({ mine: ["s1"] }), request({ kind: "cancel", to_session_id: null }));
    expect(c.pending).toEqual({ kind: "cancel", fromLabel: "Thu 1 Oct · 10:30", toLabel: null });
  });

  // The request outlives the session it names only until the cascade runs, but a page can
  // render in between. Falling back to the id would show a uuid to an attendee.
  it("survives a pending request naming a session that is gone", () => {
    const c = ctl(state({ mine: ["s1"] }), request({ to_session_id: "vanished" }));
    expect(c.pending).toEqual({ kind: "switch", fromLabel: "Thu 1 Oct · 10:30", toLabel: null });
  });

  it("offers nothing bookable when the activity is closed", () => {
    const c = ctl(state({ activity: activity({ is_open: false }) }), null);
    expect(c.bookable).toEqual([]);
  });

  // D157: asking is not taking a seat, so a closed activity still accepts a request.
  it("still offers a switch when booking is closed", () => {
    const c = ctl(state({ activity: activity({ is_open: false }), mine: ["s1"] }), null);
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
    expect(c.canRequestCancel).toBe(true);
  });
});

// D153a: an approval announces itself — they are simply booked on the new session now. A
// decline leaves no trace, so the pending block vanishing would read as the request having
// been lost. This is the only thing that tells them the desk said no.
describe("lastDeclinedFor", () => {
  it("finds the most recent decline for this activity", () => {
    const rs = [
      request({ id: "old", status: "declined", created_at: "2026-09-21T01:00:00Z", decided_at: "2026-09-21T01:30:00Z" }),
      request({ id: "new", status: "declined", created_at: "2026-09-21T03:00:00Z", decided_at: "2026-09-21T03:30:00Z" }),
    ];
    expect(lastDeclinedFor(rs, "act1")?.id).toBe("new");
  });

  it("ignores approvals, withdrawals and other activities", () => {
    expect(lastDeclinedFor([request({ status: "approved" })], "act1")).toBeNull();
    expect(lastDeclinedFor([request({ status: "withdrawn" })], "act1")).toBeNull();
    expect(lastDeclinedFor([request({ status: "declined", activity_id: "act2" })], "act1")).toBeNull();
  });

  // The case the line used to get flatly wrong: asked to move, declined; asked again,
  // approved. The attendee is now booked on the session they asked for, and D153a's own
  // wording stops the line "the moment it stops being the latest word on the subject" — a
  // later approval is a later word, so the card must not print the decline above the booking
  // that disproves it.
  it("says nothing once a later request was approved", () => {
    const rs = [
      request({ id: "declined", status: "declined", created_at: "2026-09-21T01:00:00Z", decided_at: "2026-09-21T01:30:00Z" }),
      request({ id: "approved", status: "approved", created_at: "2026-09-21T02:00:00Z", decided_at: "2026-09-21T02:30:00Z" }),
    ];
    expect(lastDeclinedFor(rs, "act1")).toBeNull();
  });

  // Same expression, the withdraw case: they changed their mind about asking again, which is
  // also a later word than the decline.
  it("says nothing once a later request was withdrawn", () => {
    const rs = [
      request({ id: "declined", status: "declined", created_at: "2026-09-21T01:00:00Z", decided_at: "2026-09-21T01:30:00Z" }),
      request({ id: "withdrawn", status: "withdrawn", created_at: "2026-09-21T02:00:00Z" }),
    ];
    expect(lastDeclinedFor(rs, "act1")).toBeNull();
  });

  // ...and the decline still shows when it IS the latest, whatever came before it.
  it("still reports a decline that is the newest request", () => {
    const rs = [
      request({ id: "approved", status: "approved", created_at: "2026-09-21T01:00:00Z", decided_at: "2026-09-21T01:30:00Z" }),
      request({ id: "declined", status: "declined", created_at: "2026-09-21T02:00:00Z", decided_at: "2026-09-21T02:30:00Z" }),
    ];
    expect(lastDeclinedFor(rs, "act1")?.id).toBe("declined");
  });
});

describe("activityControls with a decline to report", () => {
  it("reports the decline when nothing is pending", () => {
    const declined = request({ status: "declined", decided_at: "2026-09-21T03:00:00Z" });
    const c = ctl(state({ mine: ["s1"] }), null, declined);
    expect(c.declined).toEqual({ kind: "switch", fromLabel: "Thu 1 Oct · 10:30", toLabel: "Thu 1 Oct · 11:30" });
    // The controls are otherwise untouched — a decline is news, not a restriction.
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
  });

  it("says nothing about an old decline once a new request is open", () => {
    const declined = request({ id: "old", status: "declined", decided_at: "2026-09-21T03:00:00Z" });
    const c = ctl(state({ mine: ["s1"] }), request(), declined);
    expect(c.declined).toBeNull();
    expect(c.pending).not.toBeNull();
  });
});

describe("pendingCountByActivity", () => {
  it("counts only open requests, per activity", () => {
    const rs = [
      request({ id: "a" }),
      request({ id: "b" }),
      request({ id: "c", activity_id: "act2" }),
      request({ id: "d", status: "approved" }),
    ];
    expect(pendingCountByActivity(rs)).toEqual({ act1: 2, act2: 1 });
  });

  it("is empty when nothing is pending", () => {
    expect(pendingCountByActivity([request({ status: "declined" })])).toEqual({});
  });
});

describe("requestsAtDoor (D343)", () => {
  const days = new Map([["s1", "2026-10-01"], ["s2", "2026-10-01"], ["s9", "2026-10-02"]]);
  const door = { activity_id: "act1", day: "2026-10-01" };
  const who = new Set(["att1"]);

  it("picks this attendee's pending request for a session on the door's day", () => {
    expect(requestsAtDoor([request()], door, days, who, "pending")).toEqual(["req1"]);
  });
  it("leaves a request about another day's session alone", () => {
    expect(requestsAtDoor([request({ from_session_id: "s9", to_session_id: null, kind: "cancel" })], door, days, who, "pending")).toEqual([]);
  });
  it("leaves other attendees, other activities and other statuses alone", () => {
    expect(requestsAtDoor([
      request({ id: "a", attendee_id: "att2" }),
      request({ id: "b", activity_id: "act2" }),
      request({ id: "c", status: "declined" }),
    ], door, days, who, "pending")).toEqual([]);
  });
  it("finds the closed request an undo reopens, by the same rule", () => {
    expect(requestsAtDoor([request({ status: "closed" }), request({ id: "p" })], door, days, who, "closed")).toEqual(["req1"]);
  });
  it("does nothing at an ordinary door", () => {
    expect(requestsAtDoor([request()], { activity_id: null, day: "2026-10-01" }, days, who, "pending")).toEqual([]);
  });
});

describe("requestStatusLabel", () => {
  it("says why a request closed on its own", () => {
    expect(requestStatusLabel("closed")).toBe("closed, they checked in");
  });
  it("leaves the committee's and the attendee's outcomes as they read today", () => {
    expect(requestStatusLabel("approved")).toBe("approved");
    expect(requestStatusLabel("withdrawn")).toBe("withdrawn");
  });
});

// D837: an activity whose attendees change or cancel without asking. Sessions are on
// 2026-10-01 at 10:30 (s1) and 11:30 (s2); `now` is Kuala Lumpur wall-clock time.
describe("activityControls without asking (D837)", () => {
  const before = { date: "2026-10-01", time: "09:00" };
  const direct = (over: Partial<Activity> = {}) => activity({ attendee_edit: true, ...over });

  it("is off unless the organiser turns it on", () => {
    expect(activityControls(state({ mine: ["s1"] }), null, null, "en", before).direct).toBe(false);
  });

  it("is on while the activity is open", () => {
    const c = activityControls(state({ activity: direct(), mine: ["s1"] }), null, null, "en", before);
    expect(c.direct).toBe(true);
    expect(c.changeable.map((s) => s.session.id)).toEqual(["s1"]);
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
    expect(c.canRequestCancel).toBe(true);
  });

  it("falls back to asking once booking is closed", () => {
    const c = activityControls(state({ activity: direct({ is_open: false }), mine: ["s1"] }), null, null, "en", before);
    expect(c.direct).toBe(false);
    expect(c.changeable.map((s) => s.session.id)).toEqual(["s1"]);
  });

  it("locks a held session from its start time, and offers nothing to move to", () => {
    const c = activityControls(state({ activity: direct(), mine: ["s1"] }), null, null, "en", { date: "2026-10-01", time: "10:30" });
    expect(c.changeable).toEqual([]);
    expect(c.switchTargets).toEqual([]);
  });

  it("never offers a session that has started as somewhere to move to", () => {
    const c = activityControls(state({ activity: direct(), mine: ["s2"] }), null, null, "en", { date: "2026-10-01", time: "10:45" });
    expect(c.changeable.map((s) => s.session.id)).toEqual(["s2"]);
    expect(c.switchTargets).toEqual([]);
  });

  it("treats an earlier day as started", () => {
    const c = activityControls(state({ activity: direct(), mine: ["s1"] }), null, null, "en", { date: "2026-10-02", time: "08:00" });
    expect(c.changeable).toEqual([]);
  });

  it("still offers no cancel on a required activity", () => {
    const c = activityControls(state({ activity: direct({ required: true }), mine: ["s1"] }), null, null, "en", before);
    expect(c.canRequestCancel).toBe(false);
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
  });

  it("keeps every held seat changeable when asking, whatever the time", () => {
    const c = activityControls(state({ mine: ["s1"] }), null, null, "en", { date: "2026-10-02", time: "08:00" });
    expect(c.changeable.map((s) => s.session.id)).toEqual(["s1"]);
  });
});

// D842: once a session's start time passes, in Kuala Lumpur time, it is struck through and
// nobody can book it or move into it - asking or not.
describe("activityControls and started sessions (D842)", () => {
  const between = { date: "2026-10-01", time: "10:45" };

  it("names the sessions that have started", () => {
    expect(activityControls(state(), null, null, "en", BEFORE).started).toEqual([]);
    expect(activityControls(state(), null, null, "en", between).started).toEqual(["s1"]);
    expect(activityControls(state(), null, null, "en", { date: "2026-10-01", time: "10:30" }).started).toEqual(["s1"]);
    expect(activityControls(state(), null, null, "en", { date: "2026-10-02", time: "08:00" }).started).toEqual(["s1", "s2"]);
  });

  it("offers only sessions still to start for booking", () => {
    expect(activityControls(state(), null, null, "en", between).bookable.map((s) => s.session.id)).toEqual(["s2"]);
    expect(activityControls(state(), null, null, "en", { date: "2026-10-02", time: "08:00" }).bookable).toEqual([]);
  });

  it("never offers a started session to ask to move into", () => {
    const c = activityControls(
      activityState({
        activity: activity(),
        sessions: [session("s1"), session("s2", { starts_at: "11:30" }), session("s3", { starts_at: "14:00" })],
        counts: {}, mine: new Set(["s3"]), category: null,
      }),
      null, null, "en", between,
    );
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
  });

  it("still names started sessions while a request is open", () => {
    expect(activityControls(state({ mine: ["s2"] }), request(), null, "en", between).started).toEqual(["s1"]);
  });
});
