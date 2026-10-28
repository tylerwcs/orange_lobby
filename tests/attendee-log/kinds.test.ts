import { describe, it, expect } from "vitest";
import { KIND_GROUPS, KIND_GROUP_LABELS, VERB } from "@/features/attendee-log/lib/kinds";

describe("attendee log kinds", () => {
  const kinds = Object.keys(VERB);

  it("every kind is in exactly one group", () => {
    for (const k of kinds) {
      const groups = Object.entries(KIND_GROUPS).filter(([, list]) => (list as string[]).includes(k));
      expect(groups, k).toHaveLength(1);
    }
    expect(Object.values(KIND_GROUPS).flat()).toHaveLength(kinds.length);
  });

  it("every kind has a verb", () => {
    for (const k of kinds) expect(VERB[k as keyof typeof VERB].length, k).toBeGreaterThan(0);
  });

  it("every group has a label", () => {
    expect(Object.keys(KIND_GROUP_LABELS).sort()).toEqual(Object.keys(KIND_GROUPS).sort());
  });
});
