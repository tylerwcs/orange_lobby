import { describe, expect, it } from "vitest";
import { activityState } from "@/lib/activities";
import { activityNav, bookingSection } from "@/lib/portal-activities";
import type { Activity, ActivitySession } from "@/lib/types";

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: "act1", org_id: "o", event_id: "e", name: "Golf or spa", description: null,
  kind: "booking", required: false, is_open: true, max_per_attendee: 1, categories: null,
  questions: [], per_day: false, image_url: null, starts_on: null, ends_on: null, venue: null, action_label: null, sort_order: 0, ...over,
});
const session = (id: string): ActivitySession => ({
  id, event_id: "e", activity_id: "act1", day: "2026-09-30", starts_at: "08:00",
  ends_at: "09:00", location: "Clubhouse", capacity: 4, sort_order: 0,
});
const state = (over: Partial<Activity> = {}, mine: string[] = [], category: string | null = null) =>
  activityState({ activity: activity(over), sessions: [session("s1"), session("s2")], counts: {}, mine: new Set(mine), category });

describe("bookingSection", () => {
  it("puts a required activity with nothing held under To choose", () => {
    expect(bookingSection(state({ required: true }), false)).toBe("choose");
  });

  it("puts an activity with a held seat under Booked, required or not", () => {
    expect(bookingSection(state({ required: true }, ["s1"]), false)).toBe("booked");
    expect(bookingSection(state({}, ["s1"]), false)).toBe("booked");
  });

  it("keeps an activity under Booked while a request on it is open", () => {
    // A pending request always hangs off a held seat, but the section should not depend on
    // the two arriving in the same render.
    expect(bookingSection(state(), true)).toBe("booked");
  });

  it("puts an optional activity with nothing held under Open to you", () => {
    expect(bookingSection(state(), false)).toBe("open");
  });

  it("still lists a closed optional activity, so the desk can be asked about it", () => {
    expect(bookingSection(state({ is_open: false }), false)).toBe("open");
  });

  it("leaves out an activity the attendee's category cannot see", () => {
    expect(bookingSection(state({ categories: ["VIP"] }, [], "Staff"), false)).toBeNull();
  });
});

describe("activityNav", () => {
  it("hides the tab when the event runs no activities", () => {
    expect(activityNav([], null, new Set())).toEqual({ show: false, owed: false });
  });

  it("hides the tab when every activity is for another category", () => {
    expect(activityNav([activity({ categories: ["VIP"] })], "Staff", new Set())).toEqual({ show: false, owed: false });
  });

  it("shows the tab for a submission activity alone", () => {
    expect(activityNav([activity({ kind: "submission" })], null, new Set())).toEqual({ show: true, owed: false });
  });

  it("flags a required booking activity nothing is held in", () => {
    expect(activityNav([activity({ required: true })], null, new Set())).toEqual({ show: true, owed: true });
  });

  it("clears the flag once one seat is held", () => {
    expect(activityNav([activity({ required: true })], null, new Set(["act1"]))).toEqual({ show: true, owed: false });
  });

  it("does not flag a required activity the attendee cannot see", () => {
    const acts = [activity({ required: true, categories: ["VIP"] }), activity({ id: "act2" })];
    expect(activityNav(acts, "Staff", new Set())).toEqual({ show: true, owed: false });
  });
});
