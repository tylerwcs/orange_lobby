import { describe, expect, it } from "vitest";
import { pickPopup, onTargetPage, readPopupForm, type PickInput, type PortalPopup } from "@/features/popups/client";
import type { Activity, ActivitySession } from "@/lib/types";

const activity = (id: string, over: Partial<Activity> = {}): Activity => ({
  id, org_id: "o", event_id: "e", name: `Activity ${id}`, description: null,
  kind: "booking", required: false, is_open: true, pinned: false, attendee_edit: false, show_leaderboard: true, health_data: false, proxy_fields: [], max_per_attendee: 1, categories: null,
  questions: [], per_day: false, group_mode: "off", group_target: null, scoring: null, image_url: null, starts_on: null, ends_on: null, venue: null, action_label: null, stamps_required: null, reward_message: null, sort_order: 0, ...over,
});
const session = (id: string, activityId: string, over: Partial<ActivitySession> = {}): ActivitySession => ({
  id, event_id: "e", activity_id: activityId, day: "2026-11-06", starts_at: "10:00", ends_at: "10:05", location: null, capacity: 1, sort_order: 0, ...over,
});
const popup = (id: string, activityId: string, over: Partial<PortalPopup> = {}): PortalPopup => ({
  id, org_id: "o", event_id: "e", heading: `Popup ${id}`, message_html: "<p>Book</p>", button_label: "Book now",
  trigger_kind: "not_done", activity_id: activityId, is_on: true, sort_order: 0, created_at: "2026-10-28T00:00:00Z", ...over,
});

const input = (over: Partial<PickInput> = {}): PickInput => ({
  popups: [popup("p1", "a1")],
  activities: [activity("a1")],
  category: null,
  held: new Set(),
  arrived: new Set(),
  sessions: [session("s1", "a1")],
  counts: {},
  now: { date: "2026-11-01", time: "09:00" },
  ...over,
});

describe("pickPopup", () => {
  it("shows the first on popup when nothing is booked", () => {
    expect(pickPopup(input())?.id).toBe("p1");
  });

  it("shows nothing once the activity is booked", () => {
    expect(pickPopup(input({ held: new Set(["a1"]) }))).toBeNull();
  });

  it("shows nothing after a walk-in at the activity's door", () => {
    expect(pickPopup(input({ arrived: new Set(["a1"]) }))).toBeNull();
  });

  it("shows nothing when switched off", () => {
    expect(pickPopup(input({ popups: [popup("p1", "a1", { is_on: false })] }))).toBeNull();
  });

  it("falls through to the second popup when the first no longer applies", () => {
    const got = pickPopup(input({
      popups: [popup("p1", "a1"), popup("p2", "a2")],
      activities: [activity("a1"), activity("a2")],
      sessions: [session("s1", "a1"), session("s2", "a2")],
      held: new Set(["a1"]),
    }));
    expect(got?.id).toBe("p2");
  });

  it("shows nothing when the activity is not shown to attendees", () => {
    expect(pickPopup(input({ activities: [] }))).toBeNull();
  });

  it("shows nothing to a category that can't see the activity", () => {
    expect(pickPopup(input({ activities: [activity("a1", { categories: ["VIP"] })], category: "Staff" }))).toBeNull();
  });

  it("shows nothing when every session is full", () => {
    expect(pickPopup(input({ counts: { s1: 1 } }))).toBeNull();
  });

  it("treats a capacity lowered below its bookings as full", () => {
    expect(pickPopup(input({ counts: { s1: 3 } }))).toBeNull();
  });

  it("ignores a session earlier today that has started", () => {
    expect(pickPopup(input({ now: { date: "2026-11-06", time: "10:30" } }))).toBeNull();
  });

  it("counts a session later today", () => {
    expect(pickPopup(input({ now: { date: "2026-11-06", time: "09:59" } }))?.id).toBe("p1");
  });

  it("ignores sessions from past days", () => {
    expect(pickPopup(input({ now: { date: "2026-11-07", time: "08:00" } }))).toBeNull();
  });

  it("shows nothing for a submission activity (pass 2)", () => {
    expect(pickPopup(input({ activities: [activity("a1", { kind: "submission" })] }))).toBeNull();
  });
});

describe("onTargetPage", () => {
  const base = "/e/x/a/t";
  it("is true on the activity's page, with or without a trailing slash", () => {
    expect(onTargetPage("/e/x/a/t/activities/a1", base, "a1")).toBe(true);
    expect(onTargetPage("/e/x/a/t/activities/a1/", base, "a1")).toBe(true);
  });
  it("is false anywhere else", () => {
    expect(onTargetPage("/e/x/a/t", base, "a1")).toBe(false);
    expect(onTargetPage("/e/x/a/t/activities", base, "a1")).toBe(false);
    expect(onTargetPage("/e/x/a/t/activities/a2", base, "a1")).toBe(false);
  });
});

describe("readPopupForm", () => {
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { heading: " Book your screening ", message: "<p>Slots are limited.</p>", button_label: " Book now ", activity_id: "a1", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("reads a complete form, trimmed", () => {
    expect(readPopupForm(form(), ["a1"])).toEqual({
      ok: true,
      input: { heading: "Book your screening", message: "<p>Slots are limited.</p>", button_label: "Book now", activity_id: "a1" },
    });
  });

  it("needs a heading", () => {
    expect(readPopupForm(form({ heading: "  " }), ["a1"])).toEqual({ ok: false, error: "A popup needs a heading, a message and a button label." });
  });

  it("needs a message with something in it", () => {
    expect(readPopupForm(form({ message: "<p></p>" }), ["a1"])).toEqual({ ok: false, error: "A popup needs a heading, a message and a button label." });
  });

  it("needs one of this event's booking activities", () => {
    expect(readPopupForm(form({ activity_id: "zz" }), ["a1"])).toEqual({ ok: false, error: "Pick the activity it reminds them about." });
  });
});
