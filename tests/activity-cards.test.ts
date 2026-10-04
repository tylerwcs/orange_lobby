import { describe, expect, it } from "vitest";
import { activityState } from "@/lib/activities";
import { activityControls } from "@/lib/activity-requests";
import { activityCards } from "@/lib/activity-cards";
import type { Passport } from "@/lib/booths";
import type { ActivityEntry, PassportEntry, SubmissionEntry } from "@/lib/portal-activity-entries";
import type { SubmitReason } from "@/lib/submissions";
import type { Activity, ActivitySession } from "@/lib/types";

const activity = (id: string, over: Partial<Activity> = {}): Activity => ({
  id, org_id: "o", event_id: "e", name: id, description: null,
  kind: "booking", required: false, is_open: true, pinned: false, attendee_edit: false, max_per_attendee: 1, categories: null,
  questions: [], per_day: false, group_mode: "off", group_target: null, scoring: null, image_url: null, starts_on: null, ends_on: null, venue: null, action_label: null, stamps_required: null, reward_message: null, sort_order: 0, ...over,
});
const session = (activityId: string): ActivitySession => ({
  id: `${activityId}-s`, event_id: "e", activity_id: activityId, day: "2026-09-30", starts_at: "08:00",
  ends_at: "09:00", location: "Clubhouse", capacity: 4, sort_order: 0,
});
const booking = (id: string, over: Partial<Activity> = {}, held = false, category: string | null = null, checkedIn = false): ActivityEntry => {
  const state = activityState({ activity: activity(id, over), sessions: [session(id)], counts: {}, mine: new Set(held ? [`${id}-s`] : []), category });
  const arrivals = checkedIn ? { [`${id}-s`]: "2026-09-30T02:00:00+00:00" } : {};
  return { state, controls: activityControls(state, null), pendingId: null, arrivals };
};
const form = (id: string, reason: SubmitReason = "ok"): SubmissionEntry => ({
  form: activity(id, { kind: "submission" }), state: { can: reason === "ok", reason, used: 0 }, mine: [], group: null,
});
const passport = (id: string, complete: boolean): PassportEntry => ({
  activity: activity(id, { kind: "passport" }),
  passport: { cells: [], collected: complete ? 1 : 0, target: 1, remaining: complete ? 0 : 1, complete, completedAt: null } satisfies Passport,
});

describe("activityCards", () => {
  it("orders To choose, Booked, Open (bookings, forms, passports), Done", () => {
    const cards = activityCards({
      bookings: [booking("open-booking"), booking("booked", {}, true), booking("must-pick", { required: true })],
      submissions: [form("form")],
      passports: [passport("done-passport", true), passport("collecting", false)],
    }, "/e/kom/a/tok");
    expect(cards.map((c) => [c.activity.id, c.section])).toEqual([
      ["must-pick", "choose"],
      ["booked", "booked"],
      ["open-booking", "open"],
      ["form", "open"],
      ["collecting", "open"],
      ["done-passport", "done"],
    ]);
  });

  it("rings only the card that is owed, and links each card to its own page", () => {
    const cards = activityCards({ bookings: [booking("a", { required: true }), booking("b")], submissions: [], passports: [] }, "/e/kom/a/tok");
    expect(cards.map((c) => c.emphasis)).toEqual([true, false]);
    expect(cards[1].href).toBe("/e/kom/a/tok/activities/b");
  });

  it("leaves out a booking the attendee's category cannot see, and an ineligible form", () => {
    const cards = activityCards({
      bookings: [booking("vip-only", { categories: ["VIP"] }, false, "Guest")],
      submissions: [form("closed", "closed"), form("hidden", "ineligible")],
      passports: [],
    }, "/p");
    expect(cards.map((c) => c.activity.id)).toEqual(["closed"]);
  });

  it("sorts a checked-in booking after open forms and before Done passports", () => {
    const cards = activityCards({
      bookings: [booking("checked-in", {}, true, null, true)],
      submissions: [form("form")],
      passports: [passport("done-passport", true)],
    }, "/e/kom/a/tok");
    expect(cards.map((c) => c.activity.id)).toEqual(["form", "checked-in", "done-passport"]);
  });
  it("puts pinned activities first, under Pinned, in the organiser's order whatever their kind (D387)", () => {
    const cards = activityCards({
      bookings: [booking("must-pick", { required: true }), booking("pinned-booking", { pinned: true, sort_order: 3 }, true)],
      submissions: [{ ...form("pinned-form"), form: activity("pinned-form", { kind: "submission", pinned: true, sort_order: 1 }) }],
      passports: [passport("collecting", false)],
    }, "/p");
    expect(cards.map((c) => [c.activity.id, c.section])).toEqual([
      ["pinned-form", "pinned"],
      ["pinned-booking", "pinned"],
      ["must-pick", "choose"],
      ["collecting", "open"],
    ]);
  });

  it("keeps the ring on a pinned activity that is still owed", () => {
    const [card] = activityCards({ bookings: [booking("a", { required: true, pinned: true })], submissions: [], passports: [] }, "/p");
    expect([card.section, card.emphasis]).toEqual(["pinned", true]);
  });
});
