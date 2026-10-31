import { describe, expect, it } from "vitest";
import { FEATURES, optionsInUse } from "@/features/catalogue/client";
import type { Activity, Event } from "@/lib/types";

// No shared fixture exists: like tests/catalogue/options.test.ts, cast a partial.
const fixtureEvent = { id: "e1", registration_limit: null, registration_needs_approval: false, self_cancel: false, committee_alert_numbers: [] } as unknown as Event;

describe("optionsInUse (D779)", () => {
  it("lists the options an event is using, and only checkable ones", () => {
    const used = optionsInUse({ ev: { ...fixtureEvent, self_cancel: true, registration_limit: null }, activities: [] });
    expect(used.has("self_cancel")).toBe(true);
    expect(used.has("waiting_list")).toBe(false);
    expect(used.has("theme")).toBe(false); // no inUse check
  });
  it("reads activities too", () => {
    const activities = [{ id: "a1", allow_pair: true }] as unknown as Activity[];
    expect(optionsInUse({ ev: fixtureEvent, activities }).has("partner_submissions")).toBe(true);
    expect(optionsInUse({ ev: fixtureEvent, activities: [] }).has("partner_submissions")).toBe(false);
  });
  it("only ever names options in the registry", () => {
    const keys = new Set(Object.values(FEATURES).flatMap((f) => f.options.map((o) => o.key)));
    const everything = optionsInUse({
      ev: { ...fixtureEvent, registration_limit: 10, self_cancel: true, committee_alert_numbers: ["6012"] },
      activities: [{ allow_pair: true }] as unknown as Activity[],
    });
    for (const k of everything) expect(keys.has(k), k).toBe(true);
  });
});
