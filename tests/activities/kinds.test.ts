import { describe, expect, it } from "vitest";
import { ACTIVITY_KINDS, KIND_META, activityTabs } from "@/features/activities/client";

describe("KIND_META (D415)", () => {
  it("lists every kind once, in the order the menu and the portal use", () => {
    expect(ACTIVITY_KINDS).toEqual(["booking", "submission", "passport", "polaroid"]);
    expect(Object.keys(KIND_META).sort()).toEqual([...ACTIVITY_KINDS].sort());
  });

  it("keeps the words attendees and organisers already see", () => {
    expect(ACTIVITY_KINDS.map((k) => KIND_META[k].label)).toEqual(["Sessions", "Submission", "Passport", "Polaroid wall"]);
    expect(KIND_META.passport.title).toBe("Add a booth passport");
  });
});

describe("activityTabs per kind (D414)", () => {
  it("gives a passport its Setup tab only, by its own entry rather than a fall-through", () => {
    expect(activityTabs("passport", {}).map((t) => t.tab)).toEqual(["setup"]);
  });
});

describe("the polaroid kind (D471)", () => {
  it("has Setup, Polaroids (counted) and Stickers", () => {
    const tabs = activityTabs("polaroid", { polaroids: 4 });
    expect(tabs.map((t) => t.tab)).toEqual(["setup", "polaroids", "stickers"]);
    expect(tabs[1].count).toBe(4);
  });
});
