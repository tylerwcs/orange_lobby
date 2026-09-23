import { describe, expect, it } from "vitest";
import { activitySummaries } from "@/lib/activities";
import type { Activity, ActivityBooking, ActivitySession } from "@/lib/types";

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "InBody Scan", description: null,
  kind: "booking", required: false, is_open: true, max_per_attendee: 1, categories: null,
  questions: [], per_day: false, sort_order: 0, ...over,
});
const session = (id: string, over: Partial<ActivitySession> = {}): ActivitySession => ({
  id, event_id: "e", activity_id: "act1", title: id, day: "2026-09-28", starts_at: "11:00",
  ends_at: "11:15", location: "Gardensby17", capacity: 3, sort_order: 0, ...over,
});
const booking = (activity_id: string, session_id: string, attendee_id: string): ActivityBooking =>
  ({ id: `${session_id}:${attendee_id}`, event_id: "e", activity_id, session_id, attendee_id, created_at: "2026-09-22T00:00:00Z" });

const everyone = () => null;

describe("activitySummaries", () => {
  it("returns nothing when the event has no activities", () => {
    expect(activitySummaries([], [], {}, [], ["a1"], everyone)).toEqual([]);
  });

  it("adds up seats across an activity's sessions", () => {
    const rows = activitySummaries(
      [activity()], [session("s1"), session("s2")], { s1: 2 }, [], [], everyone,
    );
    expect(rows[0]).toMatchObject({ name: "InBody Scan", sessions: 2, capacity: 6, booked: 2, left: 4 });
  });

  it("never reports negative seats left when a capacity was lowered under its bookings", () => {
    const rows = activitySummaries([activity()], [session("s1", { capacity: 1 })], { s1: 3 }, [], [], everyone);
    expect(rows[0]).toMatchObject({ booked: 3, left: 0 });
  });

  it("counts an attendee holding nothing in this activity as unbooked", () => {
    const rows = activitySummaries(
      [activity()], [session("s1")], { s1: 1 },
      [booking("act1", "s1", "a1")], ["a1", "a2"], everyone,
    );
    expect(rows[0].unbooked).toBe(1);
  });

  it("leaves out attendees the activity's categories exclude", () => {
    const rows = activitySummaries(
      [activity({ categories: ["VIP"] })], [session("s1")], {}, [], ["a1", "a2"],
      (id) => (id === "a1" ? "VIP" : "Staff"),
    );
    expect(rows[0].unbooked).toBe(1);
  });

  it("keeps each activity's sessions to itself", () => {
    const rows = activitySummaries(
      [activity(), activity({ id: "act2", name: "Massage" })],
      [session("s1"), session("s2", { activity_id: "act2", capacity: 10 })],
      {}, [], [], everyone,
    );
    expect(rows.map((r) => [r.name, r.capacity])).toEqual([["InBody Scan", 3], ["Massage", 10]]);
  });

  it("reports an activity with no sessions as empty rather than skipping it", () => {
    const rows = activitySummaries([activity()], [], {}, [], ["a1"], everyone);
    expect(rows[0]).toMatchObject({ sessions: 0, capacity: 0, booked: 0, left: 0, unbooked: 1 });
  });
});
