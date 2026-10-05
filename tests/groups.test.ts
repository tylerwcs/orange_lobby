import { describe, expect, it } from "vitest";
import { entryCountsFrom, groupProgress, groupSummary, planGroupsFromColumn, groupFieldValues, taggedFirst, withGroupColumn, groupsNotDone, GROUP_EXPORT_KEY } from "@/lib/groups";
import type { Activity, ActivitySubmission, EventGroup } from "@/lib/types";

const form = (over: Partial<Activity> = {}) => ({ id: "f1", group_mode: "entries" as const, group_target: 2, categories: null, ...over });
const sub = (id: string, attendee: string, group: string | null, over: Partial<ActivitySubmission> = {}): ActivitySubmission => ({
  id, event_id: "e", activity_id: "f1", attendee_id: attendee, group_id: group, answers: {},
  submitted_on: "2026-10-01", status: "submitted", per_day: false, created_at: "2026-10-01T01:00:00Z",
  revoked_at: null, revoked_by: null, edited_at: null, edited_by: null, attendee_edited_at: null, submitted_by: null, file_hashes: {}, ...over,
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
      .toEqual([{ label: "Company", value: "Ecopia", tag: false }]);
  });

  it("marks a yes as a tag, so Captain: Yes reads as Captain (D366)", () => {
    const fields = [
      { key: "captain", label: "Captain", type: "text" as const },
      { key: "vice", label: "Vice Captain", type: "select" as const, options: ["Yes", "No"] },
      { key: "table", label: "Table", type: "number" as const },
      { key: "team", label: "Team", type: "text" as const },
    ];
    expect(groupFieldValues({ extra: { captain: "yes", vice: "No", table: "1", team: "True" } }, ["captain", "vice", "table", "team"], fields)).toEqual([
      { label: "Captain", value: "yes", tag: true },
      { label: "Vice Captain", value: "No", tag: false },
      { label: "Table", value: "1", tag: false },
      { label: "Team", value: "True", tag: true },
    ]);
  });
});

describe("taggedFirst (D366)", () => {
  const fields = [{ key: "captain", label: "Captain", type: "text" as const }, { key: "vice", label: "Vice Captain", type: "text" as const }];
  const m = (name: string, extra: Record<string, string> = {}) => ({ name, extra });

  it("puts members holding a tag first, in the order the tags were chosen, and keeps the rest as they were", () => {
    const list = [m("Ann"), m("Bo", { vice: "Yes" }), m("Cy"), m("Di", { captain: "Yes" }), m("Ed", { captain: "No" })];
    expect(taggedFirst(list, ["captain", "vice"], fields).map((x) => x.name)).toEqual(["Di", "Bo", "Ann", "Cy", "Ed"]);
  });

  it("leaves the order alone when nothing is shared", () => {
    const list = [m("Bo", { vice: "Yes" }), m("Ann")];
    expect(taggedFirst(list, [], fields).map((x) => x.name)).toEqual(["Bo", "Ann"]);
  });
});

describe("groupsNotDone (F2)", () => {
  const g = (id: string, name: string): EventGroup => ({ id, org_id: "o", event_id: "e", name, created_at: "" });
  const attendee = (id: string, name: string, category: string, groupId: string | null) => ({ id, name, category, group_id: groupId });

  it("lists each not-done group with who's missing, in entries mode", () => {
    const groups = [g("g1", "Red"), g("g2", "Blue")];
    const attendees = [attendee("a", "Aisyah", "KOM", "g1"), attendee("b", "Ben", "KOM", "g1"), attendee("c", "Chen", "Crew", "g2")];
    const subs = [sub("s1", "a", "g1")];
    expect(groupsNotDone(form(), groups, attendees, subs)).toEqual([
      { groupId: "g1", name: "Red", summary: "1 of 2 entries", waitingOn: [], missingIds: ["b"] },
      { groupId: "g2", name: "Blue", summary: "0 of 2 entries", waitingOn: [], missingIds: ["c"] },
    ]);
  });

  it("names who it's waiting on in everyone mode", () => {
    const everyone = form({ group_mode: "everyone", group_target: null, categories: ["KOM"] });
    const groups = [g("g1", "Red")];
    const attendees = [attendee("a", "Aisyah", "KOM", "g1"), attendee("b", "Ben", "KOM", "g1")];
    expect(groupsNotDone(everyone, groups, attendees, [sub("s1", "a", "g1")])).toEqual([
      { groupId: "g1", name: "Red", summary: "1 of 2 members submitted", waitingOn: ["Ben"], missingIds: ["b"] },
    ]);
  });

  it("excludes a group that is already done", () => {
    const groups = [g("g1", "Red")];
    const attendees = [attendee("a", "Aisyah", "KOM", "g1"), attendee("b", "Ben", "KOM", "g1")];
    const subs = [sub("s1", "a", "g1"), sub("s2", "b", "g1")];
    expect(groupsNotDone(form(), groups, attendees, subs)).toEqual([]);
  });

  it("leaves out members the activity's categories don't cover", () => {
    const restricted = form({ categories: ["KOM"] });
    const groups = [g("g1", "Red")];
    const attendees = [attendee("a", "Aisyah", "KOM", "g1"), attendee("b", "Ben", "Crew", "g1")];
    expect(groupsNotDone(restricted, groups, attendees, [])[0].missingIds).toEqual(["a"]);
  });

  it("skips a group with nobody eligible", () => {
    const restricted = form({ categories: ["KOM"] });
    const groups = [g("g1", "Red")];
    const attendees = [attendee("a", "Aisyah", "Crew", "g1")];
    expect(groupsNotDone(restricted, groups, attendees, [])).toEqual([]);
  });
});

describe("withGroupColumn (D361)", () => {
  it("leads with Group when the event has groups, and changes nothing when it has none", () => {
    const cols = [{ key: "company", label: "Company" }];
    expect(withGroupColumn(cols, true)).toEqual([{ key: GROUP_EXPORT_KEY, label: "Group" }, ...cols]);
    expect(withGroupColumn(cols, false)).toBe(cols);
  });
});

describe("entryCountsFrom (D400)", () => {
  it("reads the database's one row per group into a map, whatever the total", () => {
    const m = entryCountsFrom([{ group_id: "g1", entries: 1450 }, { group_id: "g2", entries: "7" }]);
    expect(m.get("g1")).toBe(1450);
    expect(m.get("g2")).toBe(7);
    expect(m.get("g3")).toBeUndefined();
  });

  it("is empty with no rows", () => {
    expect(entryCountsFrom(null).size).toBe(0);
  });
});
