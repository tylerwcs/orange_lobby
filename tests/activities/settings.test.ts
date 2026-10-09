import { describe, expect, it } from "vitest";
import { KIND_SETTINGS, newActivityFrom, readSettings } from "@/features/activities/kinds/settings";
import { ACTIVITY_KINDS } from "@/features/activities/client";

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) fd.append(k, one);
  return fd;
};

describe("readSettings (D420)", () => {
  it("has a reader for every kind", () => {
    expect(Object.keys(KIND_SETTINGS).sort()).toEqual([...ACTIVITY_KINDS].sort());
  });

  describe("booking", () => {
    it("reads the shared policy fields", () => {
      const r = readSettings("booking", form({ name: " Workshops ", description: "", max_per_attendee: "2", categories: ["VIP", "Staff"], required: "on" }));
      expect(r).toEqual({ ok: true, settings: { name: "Workshops", description: null, required: true, max_per_attendee: 2, categories: ["VIP", "Staff"] } });
    });

    it("returns the sentence instead of throwing, so the action can flash it", () => {
      expect(readSettings("booking", form({ name: "" }))).toEqual({ ok: false, error: "An activity needs a name" });
      expect(readSettings("booking", form({ name: "W", max_per_attendee: "0" }))).toEqual({ ok: false, error: "Sessions per person must be a whole number between 1 and 10" });
    });

    it("creates with is_open as the add form says, and no questions", () => {
      const r = readSettings("booking", form({ name: "W" }));
      if (!r.ok) throw new Error(r.error);
      expect(newActivityFrom("booking", r.settings, true)).toMatchObject({ kind: "booking", is_open: true, questions: [], per_day: false, max_per_attendee: 1 });
      expect(newActivityFrom("booking", r.settings, false).is_open).toBe(false);
    });
  });

  describe("submission", () => {
    it("reads a bare form with every rule off", () => {
      const r = readSettings("submission", form({ name: "Photo", description: "" }));
      expect(r).toEqual({
        ok: true,
        settings: {
          name: "Photo", description: null, categories: null, max_per_attendee: null, per_day: false,
          attendee_edit: false, health_data: false, proxy_fields: [], questions: [],
          starts_on: null, ends_on: null, venue: null, action_label: null,
          group_mode: "off", group_target: null, scoring: null,
        },
      });
    });

    it("drops the per-person rules on a group form (D351)", () => {
      const r = readSettings("submission", form({ name: "Team photo", max_per_attendee: "3", per_day: "on", group_mode: "entries", group_target: "2" }));
      expect(r).toMatchObject({ ok: true, settings: { max_per_attendee: null, per_day: false, group_mode: "entries", group_target: 2 } });
    });

    it("returns each refusal as a sentence", () => {
      expect(readSettings("submission", form({ name: "" }))).toEqual({ ok: false, error: "A submission needs a name" });
      expect(readSettings("submission", form({ name: "P", max_per_attendee: "0" }))).toMatchObject({ ok: false });
      expect(readSettings("submission", form({ name: "P", ends_on: "2026-10-01" }))).toEqual({ ok: false, error: "Add a start date, or clear the end date." });
    });

    it("creates closed or open as the add form says, never required", () => {
      const r = readSettings("submission", form({ name: "P" }));
      if (!r.ok) throw new Error(r.error);
      expect(newActivityFrom("submission", r.settings, true)).toMatchObject({ kind: "submission", required: false, is_open: true });
    });
  });

  describe("passport", () => {
    it("bounds the target by the booths it has", () => {
      expect(readSettings("passport", form({ name: "Passport", stamps_required: "2" }), { boothCount: 3 }))
        .toMatchObject({ ok: true, settings: { name: "Passport", stamps_required: 2, reward_message: null } });
      expect(readSettings("passport", form({ name: "Passport", stamps_required: "5" }), { boothCount: 3 }))
        .toEqual({ ok: false, error: "This passport has 3 booths, so the target cannot be 5." });
    });

    it("leaves the target unbounded while it is being created", () => {
      expect(readSettings("passport", form({ name: "Passport", stamps_required: "5" }))).toMatchObject({ ok: true, settings: { stamps_required: 5 } });
      expect(readSettings("passport", form({ name: "" }))).toEqual({ ok: false, error: "A passport needs a name" });
    });

    it("creates with no cap and no questions (D183)", () => {
      const r = readSettings("passport", form({ name: "Passport" }));
      if (!r.ok) throw new Error(r.error);
      expect(newActivityFrom("passport", r.settings, true)).toMatchObject({ kind: "passport", required: false, is_open: true, max_per_attendee: null, questions: [], per_day: false });
    });
  });
});
