import { describe, it, expect } from "vitest";
import {
  EVENT_TAB_COLUMNS, PORTAL_LOOK_COLUMNS, REGISTRATION_COLUMNS,
  eventTabPatch, portalLookPatch, registrationPatch,
} from "@/lib/settings-form";
import type { Event } from "@/lib/types";

const fdWith = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const ev = { id: "e1", org_id: "o1", name: "Old name", logo_url: "old-logo", banner_url: null, language_switch: false, registration_questions: [], attendee_fields: [] } as unknown as Event;
const imgs = { logo_url: "logo", banner_url: null };
const regImgs = { registration_banner_url: null, registration_footer_url: "footer" };
// The four standard questions, in the field names questionsFromForm reads.
const validForm: Record<string, string> = {
  q_1_label: "Full name", q_1_key: "name", q_1_type: "text", q_1_required: "on",
  q_2_label: "Email", q_2_key: "email", q_2_type: "text", q_2_required: "on",
  q_3_label: "Mobile number", q_3_key: "phone", q_3_type: "phone", q_3_required: "on",
  q_4_label: "Department", q_4_key: "department", q_4_type: "text", q_4_required: "on",
};
const sorted = (o: object) => Object.keys(o).sort();

describe("settings tab columns (D778)", () => {
  it("splits the old settings columns into three disjoint tabs", () => {
    const all = [...EVENT_TAB_COLUMNS, ...PORTAL_LOOK_COLUMNS, ...REGISTRATION_COLUMNS];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(35); // D804, D805: registration_done_qr and after_register_activity_id joined Registration
  });
  it("eventTabPatch returns exactly the Event columns", () => {
    expect(sorted(eventTabPatch(fdWith({ name: "KOM" }), ev))).toEqual([...EVENT_TAB_COLUMNS].sort());
  });
  it("eventTabPatch falls back to the stored name for the display name", () => {
    const p = eventTabPatch(fdWith({ display_name: "Old name" }), ev);
    expect(p.display_name).toBeNull();
    expect(p.name).toBeUndefined();
  });
  it("portalLookPatch returns exactly the Portal look columns", () => {
    expect(sorted(portalLookPatch(fdWith({}), ev, imgs, true))).toEqual([...PORTAL_LOOK_COLUMNS].sort());
  });
  it("portalLookPatch takes the given images and keeps the orange fallback", () => {
    const p = portalLookPatch(fdWith({}), ev, imgs, true);
    expect(p.logo_url).toBe("logo");
    expect(p.banner_url).toBeNull();
    expect(p.primary_color).toBe("#F97316");
  });
  it("portalLookPatch keeps language_switch when the add-on is off", () => {
    expect(portalLookPatch(fdWith({}), { ...ev, language_switch: true }, imgs, false).language_switch).toBe(true);
  });
  it("portalLookPatch reads language_switch when the add-on is on", () => {
    expect(portalLookPatch(fdWith({}), { ...ev, language_switch: true }, imgs, true).language_switch).toBe(false);
    expect(portalLookPatch(fdWith({ language_switch: "on" }), ev, imgs, true).language_switch).toBe(true);
  });
  it("portalLookPatch saves the Me page ticks: anything unticked is hidden", () => {
    const fd = fdWith({});
    fd.append("me_shown", ":category");
    fd.append("me_shown", "table_no");
    expect(portalLookPatch(fd, ev, imgs, true).me_hidden).toEqual([":badge", ":email"]);
  });
  it("registrationPatch returns exactly the Registration columns", () => {
    expect(sorted(registrationPatch(fdWith(validForm), ev, regImgs))).toEqual([...REGISTRATION_COLUMNS].sort());
  });
  it("registrationPatch takes the given images and a valid limit", () => {
    const p = registrationPatch(fdWith({ ...validForm, registration_limit: "50" }), ev, regImgs);
    expect(p.registration_footer_url).toBe("footer");
    expect(p.registration_limit).toBe(50);
  });
  it("registrationPatch refuses a bad limit", () => {
    expect(() => registrationPatch(fdWith({ ...validForm, registration_limit: "0" }), ev, regImgs))
      .toThrow("Limit registrations to a whole number above 0, or leave it blank for no limit.");
  });
  it("registrationPatch refuses a bad question form", () => {
    expect(() => registrationPatch(fdWith({ ...validForm, q_5_label: "Name", q_5_key: "name" }), ev, regImgs)).toThrow(/same answer/);
  });
});
