import { describe, expect, it } from "vitest";
import { pendingFor, lastDeclinedFor, activityControls, pendingCountByActivity } from "@/lib/activity-requests";
import { activityState } from "@/lib/activities";
import type { Activity, ActivityChangeRequest, ActivitySession } from "@/lib/types";

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "Workshops", description: null,
  required: false, booking_open: true, max_per_attendee: 1, categories: null, sort_order: 0, ...over,
});
const session = (id: string, over: Partial<ActivitySession> = {}): ActivitySession => ({
  id, event_id: "e", activity_id: "act1", title: id, day: "2026-10-01", starts_at: "09:30",
  ends_at: "11:00", location: "Room 2A", capacity: 30, sort_order: 0, ...over,
});
const request = (over: Partial<ActivityChangeRequest> = {}): ActivityChangeRequest => ({
  id: "req1", event_id: "e", activity_id: "act1", attendee_id: "att1", kind: "switch",
  from_session_id: "s1", to_session_id: "s2", status: "pending",
  created_at: "2026-09-21T02:00:00Z", decided_at: null, decided_by: null, ...over,
});
const state = (over: { activity?: Activity; mine?: string[]; counts?: Record<string, number> } = {}) =>
  activityState({
    activity: over.activity ?? activity(),
    sessions: [session("s1"), session("s2", { starts_at: "11:30" })],
    counts: over.counts ?? {},
    mine: new Set(over.mine ?? []),
    category: null,
  });

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
    const c = activityControls(state(), null);
    expect(c.bookable.map((s) => s.session.id)).toEqual(["s1", "s2"]);
    expect(c.holding).toBeNull();
    expect(c.switchTargets).toEqual([]);
    expect(c.canRequestCancel).toBe(false);
  });

  it("names the held session and offers the others as switch targets", () => {
    const c = activityControls(state({ mine: ["s1"] }), null);
    expect(c.holding?.session.id).toBe("s1");
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
    expect(c.bookable).toEqual([]);
  });

  // D148: a required activity's cancel never reaches the queue, so the control is absent.
  it("offers no cancel on a required activity", () => {
    expect(activityControls(state({ activity: activity({ required: true }), mine: ["s1"] }), null).canRequestCancel).toBe(false);
    expect(activityControls(state({ mine: ["s1"] }), null).canRequestCancel).toBe(true);
  });

  it("never offers a full session as a switch target", () => {
    const c = activityControls(state({ mine: ["s1"], counts: { s2: 30 } }), null);
    expect(c.switchTargets).toEqual([]);
  });

  // D143 and §7.4: while a request is open, nothing that changes a seat is offered.
  it("withholds every control while a request is pending", () => {
    const c = activityControls(state({ mine: ["s1"] }), request());
    expect(c.bookable).toEqual([]);
    expect(c.switchTargets).toEqual([]);
    expect(c.canRequestCancel).toBe(false);
    expect(c.pending).toEqual({ kind: "switch", fromTitle: "s1", toTitle: "s2" });
  });

  // A cap of one already makes bookable empty on its own (see the test above), so that test
  // alone cannot prove the pending branch is doing anything. This pair uses a cap of two,
  // the one configuration the rule exists for: an attendee who could still take a second
  // seat must not be offered it while a request about their first seat is open, because
  // taking it would change what the desk is being asked to decide. Deleting the pending
  // branch's `bookable: []` must fail the first of these two and pass the second.
  it("withholds Book while pending even when the cap would still allow another seat", () => {
    const twoSeats = { activity: activity({ max_per_attendee: 2 }), mine: ["s1"] };
    const c = activityControls(state(twoSeats), request());
    expect(c.bookable).toEqual([]);
  });

  it("offers Book for that same cap-of-two attendee once nothing is pending", () => {
    const twoSeats = { activity: activity({ max_per_attendee: 2 }), mine: ["s1"] };
    const c = activityControls(state(twoSeats), null);
    expect(c.bookable.map((s) => s.session.id)).toEqual(["s2"]);
  });

  it("summarises a pending cancel with no target", () => {
    const c = activityControls(state({ mine: ["s1"] }), request({ kind: "cancel", to_session_id: null }));
    expect(c.pending).toEqual({ kind: "cancel", fromTitle: "s1", toTitle: null });
  });

  // The request outlives the session it names only until the cascade runs, but a page can
  // render in between. Falling back to the id would show a uuid to an attendee.
  it("survives a pending request naming a session that is gone", () => {
    const c = activityControls(state({ mine: ["s1"] }), request({ to_session_id: "vanished" }));
    expect(c.pending).toEqual({ kind: "switch", fromTitle: "s1", toTitle: null });
  });

  it("offers nothing bookable when the activity is closed", () => {
    const c = activityControls(state({ activity: activity({ booking_open: false }) }), null);
    expect(c.bookable).toEqual([]);
  });

  // D157: asking is not taking a seat, so a closed activity still accepts a request.
  it("still offers a switch when booking is closed", () => {
    const c = activityControls(state({ activity: activity({ booking_open: false }), mine: ["s1"] }), null);
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
      request({ id: "old", status: "declined", decided_at: "2026-09-21T01:00:00Z" }),
      request({ id: "new", status: "declined", decided_at: "2026-09-21T03:00:00Z" }),
    ];
    expect(lastDeclinedFor(rs, "act1")?.id).toBe("new");
  });

  it("ignores approvals, withdrawals and other activities", () => {
    expect(lastDeclinedFor([request({ status: "approved" })], "act1")).toBeNull();
    expect(lastDeclinedFor([request({ status: "withdrawn" })], "act1")).toBeNull();
    expect(lastDeclinedFor([request({ status: "declined", activity_id: "act2" })], "act1")).toBeNull();
  });
});

describe("activityControls with a decline to report", () => {
  it("reports the decline when nothing is pending", () => {
    const declined = request({ status: "declined", decided_at: "2026-09-21T03:00:00Z" });
    const c = activityControls(state({ mine: ["s1"] }), null, declined);
    expect(c.declined).toEqual({ kind: "switch", fromTitle: "s1", toTitle: "s2" });
    // The controls are otherwise untouched — a decline is news, not a restriction.
    expect(c.switchTargets.map((s) => s.session.id)).toEqual(["s2"]);
  });

  it("says nothing about an old decline once a new request is open", () => {
    const declined = request({ id: "old", status: "declined", decided_at: "2026-09-21T03:00:00Z" });
    const c = activityControls(state({ mine: ["s1"] }), request(), declined);
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
