import { describe, expect, it } from "vitest";
import { groupProgress, groupSummary, planGroupsFromColumn, groupFieldValues } from "@/lib/groups";
import type { Activity, ActivitySubmission, EventGroup } from "@/lib/types";

const form = (over: Partial<Activity> = {}) => ({ id: "f1", group_mode: "entries" as const, group_target: 2, categories: null, ...over });
const sub = (id: string, attendee: string, group: string | null, over: Partial<ActivitySubmission> = {}): ActivitySubmission => ({
  id, event_id: "e", activity_id: "f1", attendee_id: attendee, group_id: group, answers: {},
  submitted_on: "2026-10-01", status: "submitted", per_day: false, created_at: "2026-10-01T01:00:00Z",
  revoked_at: null, revoked_by: null, edited_at: null, edited_by: null, ...over,
});
const members = [
  { id: "a", name: "Aisyah", category: "KOM" },
  { id: "b", name: "Ben", category: "KOM" },
  { id: "c", name: "Chen", category: "Crew" },
];

describe("groupProgress — entries mode", () => {
  it("counts the group's live entries against the target", () => {
    const p = groupProgress(form(), "g1", members, [sub("s1", "a", "g1"), sub("s2", "a", "g1", { status: "revoked" }), sub("s3", "x", "g2")]);
    expect(p).toMatchObject({ groupId: "g1", done: false, have: 1, need: 2 });
    expect(p.entries.map((e) => e.id)).toEqual(["s1"]);
    expect(p.members).toEqual([
      { id: "a", name: "Aisyah", submitted: true },
      { id: "b", name: "Ben", submitted: false },
      { id: "c", name: "Chen", submitted: false },
    ]);
  });

  it("is done at the target, and counts an entry from a member who has since moved out (D355)", () => {
    const p = groupProgress(form(), "g1", members, [sub("s1", "a", "g1"), sub("s2", "gone", "g1")]);
    expect(p).toMatchObject({ done: true, have: 2, need: 2 });
  });

  it("ignores other forms' entries", () => {
    expect(groupProgress(form(), "g1", members, [sub("s1", "a", "g1", { activity_id: "f2" })]).have).toBe(0);
  });
});

describe("groupProgress — everyone mode", () => {
  const everyone = form({ group_mode: "everyone", group_target: null, categories: ["KOM"] });

  it("needs every eligible current member, and leaves out members outside the categories (D352)", () => {
    const p = groupProgress(everyone, "g1", members, [sub("s1", "a", "g1")]);
    expect(p).toMatchObject({ done: false, have: 1, need: 2 });
    expect(p.members.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("is done when all of them have submitted; a former member's entry is listed but not counted (D355)", () => {
    const p = groupProgress(everyone, "g1", members, [sub("s1", "a", "g1"), sub("s2", "b", "g1"), sub("s3", "gone", "g1")]);
    expect(p).toMatchObject({ done: true, have: 2, need: 2 });
    expect(p.entries).toHaveLength(3);
  });

  it("is never done with nobody eligible", () => {
    expect(groupProgress(everyone, "g1", [], []).done).toBe(false);
  });
});

describe("groupSummary", () => {
  it("says it in the mode's words", () => {
    expect(groupSummary({ have: 2, need: 3 }, "entries")).toBe("2 of 3 entries");
    expect(groupSummary({ have: 1, need: 1 }, "entries")).toBe("1 of 1 entry");
    expect(groupSummary({ have: 4, need: 6 }, "everyone")).toBe("4 of 6 members submitted");
  });
});

describe("planGroupsFromColumn (D347)", () => {
  const g = (id: string, name: string): EventGroup => ({ id, org_id: "o", event_id: "e", name, created_at: "" });
  const at = (id: string, team: string, group_id: string | null = null) => ({ id, group_id, category: null, extra: { team } });

  it("creates one group per distinct trimmed value, ignoring case, keeping the first spelling", () => {
    const plan = planGroupsFromColumn([at("1", "Red "), at("2", "red"), at("3", "Blue"), at("4", "  ")], "team", []);
    expect(plan.create).toEqual(["Red", "Blue"]);
    expect(plan.moves).toEqual([
      { attendeeId: "1", groupName: "Red" }, { attendeeId: "2", groupName: "Red" }, { attendeeId: "3", groupName: "Blue" },
    ]);
    expect(plan.blank).toBe(1);
  });

  it("reuses an existing group by name and skips people already in it", () => {
    const plan = planGroupsFromColumn([at("1", "RED", "g-red"), at("2", "red", "g-blue")], "team", [g("g-red", "Red"), g("g-blue", "Blue")]);
    expect(plan.create).toEqual([]);
    expect(plan.reuse.map((x) => x.id)).toEqual(["g-red"]);
    expect(plan.moves).toEqual([{ attendeeId: "2", groupName: "Red" }]);
    expect(plan.movingOut).toBe(1);
  });

  it("reads Category from the attendee row, not extra", () => {
    const plan = planGroupsFromColumn([{ id: "1", group_id: null, category: "VIP", extra: {} }], "category", []);
    expect(plan.create).toEqual(["VIP"]);
  });
});

describe("groupFieldValues (D348)", () => {
  it("returns the chosen fields that have a value, in the chosen order, by label", () => {
    const fields = [{ key: "company", label: "Company", type: "text" as const }, { key: "phone", label: "Phone", type: "phone" as const }];
    expect(groupFieldValues({ extra: { company: " Ecopia ", phone: "" } }, ["phone", "company", "gone"], fields))
      .toEqual([{ label: "Company", value: "Ecopia" }]);
  });
});
