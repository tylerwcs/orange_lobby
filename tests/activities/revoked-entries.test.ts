import { describe, expect, it } from "vitest";
import { revokedFor } from "@/features/activities/lib/revoked-entries";
import type { ActivitySubmission } from "@/lib/types";

const s = (id: string, activity_id: string, status: "submitted" | "revoked" = "revoked") =>
  ({ id, activity_id, status }) as ActivitySubmission;

// Review Focus 5: revoked rows reach the attendee only through this list, never through the
// live lists that canSubmit and group progress read.
describe("revokedFor (D501)", () => {
  const mine = [s("m1", "f1"), s("m2", "f2")];
  const group = [s("g1", "f1"), s("m1", "f1")];

  it("a personal form shows the attendee's own revoked rows for that form", () => {
    expect(revokedFor({ id: "f1", group_mode: "off" }, mine, group).map((x) => x.id)).toEqual(["m1"]);
  });

  it("members mode is personal too (D369)", () => {
    expect(revokedFor({ id: "f2", group_mode: "members" }, mine, group).map((x) => x.id)).toEqual(["m2"]);
  });

  it("a group form shows the group's revoked rows, including the attendee's own", () => {
    expect(revokedFor({ id: "f1", group_mode: "entries" }, mine, group).map((x) => x.id)).toEqual(["g1", "m1"]);
  });

  it("never passes a live row through", () => {
    expect(revokedFor({ id: "f1", group_mode: "off" }, [s("x", "f1", "submitted")], [])).toEqual([]);
  });
});
