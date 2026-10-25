import { describe, expect, it } from "vitest";
import { gridDisqualification } from "@/features/activities/lib/team-grid";

const dq = (attendee_id: string, week_of: string | null = "2026-11-02") => ({ attendee_id, reason: "Edited proof", week_of, created_at: "2026-11-03T00:00:00Z", created_by: "u" });

describe("gridDisqualification (D726)", () => {
  it("is this track's own disqualification first", () => {
    expect(gridDisqualification("x", [dq("x")], { dq: [dq("x", "2026-10-26")], name: "Project Active" })).toEqual({ where: null, d: dq("x") });
  });
  it("names the other track when the disqualification was made there", () => {
    expect(gridDisqualification("x", [], { dq: [dq("x")], name: "Project Active" })).toEqual({ where: "Project Active", d: dq("x") });
  });
  it("is null for someone disqualified on neither track, and without a pair", () => {
    expect(gridDisqualification("y", [dq("x")], { dq: [dq("x")], name: "Project Active" })).toBeNull();
    expect(gridDisqualification("x", [], null)).toBeNull();
  });
});
