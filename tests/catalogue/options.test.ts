import { describe, expect, it } from "vitest";
import { FEATURES } from "@/features/catalogue/client";
import type { Option } from "@/features/catalogue/options";
import type { Activity, Event } from "@/lib/types";

// No shared event or activity fixture exists in tests/: like tests/activities, cast a partial.
const fixtureEvent = { id: "e1", registration_limit: null, registration_needs_approval: false, committee_alert_numbers: [] } as unknown as Event;
const fixtureActivity = { id: "a1", allow_pair: false } as unknown as Activity;

const features = Object.values(FEATURES);
const options: Option[] = features.flatMap((f) => [...f.options]);
const option = (key: string) => {
  const found = options.find((o) => o.key === key);
  if (!found) throw new Error(`No option ${key}`);
  return found;
};

describe("the option registry (D777)", () => {
  it("gives every option a key unique across the registry", () => {
    const keys = options.map((o) => o.key);
    expect(options.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("lists the 31 options the design names", () => {
    expect(options.map((o) => o.key).sort()).toEqual([
      "waiting_list", "approval", "self_cancel", "event_terms", "done_page", "after_register_booking", "registration_images", "scheduled_open", "tick_box_questions",
      "badge_checkin", "scan_card", "door_survey", "theme", "name_line_breaks", "coming_soon", "me_page", "badge_pins", "preview_link", "committee_logins",
      "group_tile", "all_groups", "group_fields", "verifiers", "undo_revoke", "partner_submissions", "tracks", "ad_hoc_points", "tournaments", "polaroid_print_look",
      "committee_alerts", "change_log",
    ].sort());
  });
  it("dates every origin as YYYY-MM and every decision as D<number>", () => {
    const origins = [...features.map((f) => f.origin), ...options.map((o) => o.origin)].filter((o) => o !== undefined);
    expect(origins.length).toBeGreaterThan(0);
    for (const o of origins) {
      expect(o.date).toMatch(/^\d{4}-\d{2}$/);
      if (o.decision !== undefined) expect(o.decision).toMatch(/^D\d+$/);
    }
  });
  it("never names the live ecphub event as an origin", () => {
    for (const o of [...features.map((f) => f.origin), ...options.map((o) => o.origin)]) expect(o?.event?.toLowerCase()).not.toBe("ecphub");
  });
  it("says where every option is set", () => {
    for (const o of options) expect(o.where.trim(), o.key).not.toBe("");
  });
  it("names and summarises every option", () => {
    for (const o of options) {
      expect(o.name.trim(), o.key).not.toBe("");
      expect(o.summary.trim(), o.key).not.toBe("");
    }
  });
  it("gives the new add-ons their origins", () => {
    expect(FEATURES.language.origin).toEqual({ event: "MYBESTME", date: "2026-10", decision: "D736" });
    expect(FEATURES.popups.origin).toEqual({ event: "MYBESTME", date: "2026-10", decision: "D751" });
    expect(FEATURES.typing_qualifier.origin).toEqual({ date: "2026-10", decision: "D767" });
  });
  it("leaves the original features without an origin", () => {
    for (const k of ["portal", "whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido"] as const) expect(FEATURES[k].origin).toBeUndefined();
  });
  it("marks the one-client options experimental", () => {
    expect(options.filter((o) => o.experimental).map((o) => o.key).sort()).toEqual(["after_register_booking", "door_survey", "polaroid_print_look", "tracks"]);
  });
});

describe("inUse (D777)", () => {
  it("answers from the event", () => {
    const ev = { ...fixtureEvent, registration_limit: 50, registration_needs_approval: false };
    expect(option("waiting_list").inUse!({ ev, activities: [] })).toBe(true);
    expect(option("approval").inUse!({ ev, activities: [] })).toBe(false);
    expect(option("partner_submissions").inUse!({ ev, activities: [{ ...fixtureActivity, allow_pair: true }] })).toBe(true);
    expect(option("partner_submissions").inUse!({ ev, activities: [fixtureActivity] })).toBe(false);
  });
  it("is set only on the options one column or field answers", () => {
    expect(options.filter((o) => o.inUse).map((o) => o.key).sort()).toEqual([
      "after_register_booking", "all_groups", "approval", "badge_checkin", "coming_soon", "committee_alerts", "done_page", "event_terms",
      "partner_submissions", "preview_link", "self_cancel", "waiting_list",
    ]);
  });
  it("reads the committee alert numbers and the check-in pill", () => {
    const empty = { ev: fixtureEvent, activities: [] };
    expect(option("committee_alerts").inUse!(empty)).toBe(false);
    expect(option("committee_alerts").inUse!({ ...empty, ev: { ...fixtureEvent, committee_alert_numbers: ["60123"] } })).toBe(true);
    expect(option("badge_checkin").inUse!({ ...empty, ev: { ...fixtureEvent, check_in_enabled: true, badge_checkin: false } })).toBe(false);
    expect(option("badge_checkin").inUse!({ ...empty, ev: { ...fixtureEvent, check_in_enabled: true, badge_checkin: true } })).toBe(true);
  });
});
