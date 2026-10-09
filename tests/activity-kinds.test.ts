import { describe, expect, it } from "vitest";
import { ACTIVITY_KINDS, KIND_META } from "@/features/activities";

describe("KIND_META (D415)", () => {
  it("lists every kind once, in the order the menu and the portal use", () => {
    expect(ACTIVITY_KINDS).toEqual(["booking", "submission", "passport"]);
    expect(Object.keys(KIND_META).sort()).toEqual([...ACTIVITY_KINDS].sort());
  });

  it("keeps the words attendees and organisers already see", () => {
    expect(ACTIVITY_KINDS.map((k) => KIND_META[k].label)).toEqual(["Sessions", "Submission", "Passport"]);
    expect(KIND_META.passport.title).toBe("Add a booth passport");
  });
});
