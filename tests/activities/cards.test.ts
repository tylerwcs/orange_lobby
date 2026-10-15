import { describe, expect, it } from "vitest";
import { activityState } from "@/features/activities/lib/activities";
import { activityControls } from "@/features/activities/lib/activity-requests";
import { activityCards, findEntry } from "@/features/activities/client";
import type { Passport } from "@/features/activities/lib/booths";
import type { ActivityEntry, PassportEntry, PolaroidEntry, SubmissionEntry } from "@/features/activities/lib/portal-activity-entries";
import type { SubmitReason } from "@/features/activities/lib/submissions";
import type { Activity, ActivitySession } from "@/lib/types";

const activity = (id: string, over: Partial<Activity> = {}): Activity => ({
  id, org_id: "o", event_id: "e", name: id, description: null,
  kind: "booking", required: false, is_open: true, pinned: false, attendee_edit: false, show_leaderboard: true, health_data: false, proxy_fields: [], max_per_attendee: 1, categories: null,
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
  form: activity(id, { kind: "submission" }), state: { can: reason === "ok", reason, used: 0 }, mine: [], group: null, revoked: [],
});
const passport = (id: string, complete: boolean): PassportEntry => ({
  activity: activity(id, { kind: "passport" }),
  passport: { cells: [], collected: complete ? 1 : 0, target: 1, remaining: complete ? 0 : 1, complete, completedAt: null } satisfies Passport,
});

const wall = (id: string, posted = 0): PolaroidEntry => ({
  activity: activity(id, { kind: "polaroid" }),
  mine: Array.from({ length: posted }, (_, i) => ({ id: `${id}-${i}`, activity_id: id }) as PolaroidEntry["mine"][number]),
});

describe("activityCards", () => {
  it("lists a polaroid wall under Open, after passports, with its camera (D481)", () => {
    const cards = activityCards({ booking: [], submission: [], passport: [passport("p", false)], polaroid: [wall("w", 2)] }, "/p");
    expect(cards.map((c) => [c.activity.id, c.section, c.view.action?.label])).toEqual([["p", "open", "View"], ["w", "open", "Join Now"]]);
    // No "2 on the wall" badge: the card is the camera's way in, nothing more.
    expect(cards[1].view.status).toBeNull();
    // Its page is the camera (D482).
    expect(cards[1].href).toBe("/p/activities/w");
  });

  it("orders To choose, Booked, Open (bookings, forms, passports), Done", () => {
    const cards = activityCards({
      booking: [booking("open-booking"), booking("booked", {}, true), booking("must-pick", { required: true })],
      submission: [form("form")],
      passport: [passport("done-passport", true), passport("collecting", false)], polaroid: [],
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
    const cards = activityCards({ booking: [booking("a", { required: true }), booking("b")], submission: [], passport: [], polaroid: [] }, "/e/kom/a/tok");
    expect(cards.map((c) => c.emphasis)).toEqual([true, false]);
    expect(cards[1].href).toBe("/e/kom/a/tok/activities/b");
  });

  it("leaves out a booking the attendee's category cannot see, and an ineligible form", () => {
    const cards = activityCards({
      booking: [booking("vip-only", { categories: ["VIP"] }, false, "Guest")],
      submission: [form("closed", "closed"), form("hidden", "ineligible")],
      passport: [], polaroid: [],
    }, "/p");
    expect(cards.map((c) => c.activity.id)).toEqual(["closed"]);
  });

  it("sorts a checked-in booking after open forms and before Done passports", () => {
    const cards = activityCards({
      booking: [booking("checked-in", {}, true, null, true)],
      submission: [form("form")],
      passport: [passport("done-passport", true)], polaroid: [],
    }, "/e/kom/a/tok");
    expect(cards.map((c) => c.activity.id)).toEqual(["form", "checked-in", "done-passport"]);
  });
  it("puts pinned activities first, under Pinned, in the organiser's order whatever their kind (D387)", () => {
    const cards = activityCards({
      booking: [booking("must-pick", { required: true }), booking("pinned-booking", { pinned: true, sort_order: 3 }, true)],
      submission: [{ ...form("pinned-form"), form: activity("pinned-form", { kind: "submission", pinned: true, sort_order: 1 }) }],
      passport: [passport("collecting", false)], polaroid: [],
    }, "/p");
    expect(cards.map((c) => [c.activity.id, c.section])).toEqual([
      ["pinned-form", "pinned"],
      ["pinned-booking", "pinned"],
      ["must-pick", "choose"],
      ["collecting", "open"],
    ]);
  });

  it("keeps the ring on a pinned activity that is still owed", () => {
    const [card] = activityCards({ booking: [booking("a", { required: true, pinned: true })], submission: [], passport: [], polaroid: [] }, "/p");
    expect([card.section, card.emphasis]).toEqual(["pinned", true]);
  });
});

describe("findEntry (D416)", () => {
  const entries = {
    booking: [booking("b"), booking("vip", { categories: ["VIP"] }, false, "Guest")],
    submission: [form("f")],
    passport: [passport("p", false)], polaroid: [wall("w")],
  };

  it("finds each kind's entry with its kind and activity", () => {
    expect(findEntry(entries, "b")).toMatchObject({ kind: "booking", activity: { id: "b" } });
    expect(findEntry(entries, "f")).toMatchObject({ kind: "submission", activity: { id: "f" } });
    expect(findEntry(entries, "p")).toMatchObject({ kind: "passport", activity: { id: "p" } });
    expect(findEntry(entries, "w")).toMatchObject({ kind: "polaroid", activity: { id: "w" } });
  });

  it("does not find a booking the attendee's category cannot see, or an unknown id", () => {
    expect(findEntry(entries, "vip")).toBeNull();
    expect(findEntry(entries, "nope")).toBeNull();
  });
});

describe("activityCards — Coming soon (D605)", () => {
  const soon = (id: string, over: Partial<Activity> = {}) =>
    activity(id, { is_open: false, opens_at: "2026-10-17T02:00:00+00:00", ...over });

  it("lists it after Open and before Done, with no link, ring or button", () => {
    const cards = activityCards(
      { booking: [booking("b")], submission: [], passport: [passport("p", true)], polaroid: [], coming: [soon("s", { required: true })] },
      "/p",
    );
    expect(cards.map((c) => [c.activity.id, c.section])).toEqual([["b", "open"], ["s", "coming"], ["p", "done"]]);
    const s = cards.find((c) => c.activity.id === "s")!;
    expect(s.href).toBeNull();
    expect(s.emphasis).toBe(false);
    expect(s.view.action).toBeNull();
    expect(s.view.status).toEqual({ label: "Coming soon", tone: "muted" });
  });

  it("keeps a pinned one under Pinned, still as Coming soon", () => {
    const cards = activityCards({ booking: [booking("b")], submission: [], passport: [], polaroid: [], coming: [soon("s", { pinned: true })] }, "/p");
    expect(cards.map((c) => [c.activity.id, c.section, c.href])).toEqual([["s", "pinned", null], ["b", "open", "/p/activities/b"]]);
  });

  it("draws nothing extra when there is no coming list", () => {
    expect(activityCards({ booking: [booking("b")], submission: [], passport: [], polaroid: [] }, "/p")).toHaveLength(1);
  });
});
