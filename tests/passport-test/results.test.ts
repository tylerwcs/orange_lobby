import { describe, expect, it } from "vitest";
import { countByPersonality, travelSet, type PassportResult } from "@/features/passport-test/client";

const t = travelSet();
const [A, B] = t.personalities.map((p) => p.id);
const r = (personality_id: string, i: number): PassportResult => ({
  id: `r${i}`, activity_id: "x", attendee_id: `a${i}`, personality_id, answers: [], holder_name: "N", created_at: "2026-11-10T00:00:00Z",
});

describe("countByPersonality", () => {
  it("counts in the personalities' order, zeros included", () => {
    expect(countByPersonality([r(B, 1), r(A, 2), r(B, 3)], t.personalities)).toEqual([
      { id: A, name: "TRAILBLAZER", count: 1 },
      { id: B, name: "NAVIGATOR", count: 2 },
      { id: t.personalities[2].id, name: "DAYDREAMER", count: 0 },
      { id: t.personalities[3].id, name: "FLAVOUR HUNTER", count: 0 },
    ]);
  });

  it("puts results for a personality that is gone under Other, only when there are some", () => {
    const counts = countByPersonality([r("p-deadbeef", 1)], t.personalities.slice(0, 1));
    expect(counts).toEqual([{ id: A, name: "TRAILBLAZER", count: 0 }, { id: "other", name: "Other", count: 1 }]);
    expect(countByPersonality([], t.personalities.slice(0, 1)).map((c) => c.id)).toEqual([A]);
  });
});
