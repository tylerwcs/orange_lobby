import { describe, expect, it } from "vitest";
import { pairCandidates, pairRefusal, withText } from "@/features/activities/lib/pairs";

const groups = [{ id: "g1", name: "Team 1" }, { id: "g2", name: "Team 2" }, { id: "g3", name: "Team 3" }];
const people = [
  { id: "a", name: "Aisyah", group_id: "g1", category: "Wellness" },
  { id: "b", name: "Ben", group_id: "g2", category: "Wellness" },
  { id: "c", name: "Chen", group_id: "g2", category: "Crew" },
  { id: "d", name: "Dina", group_id: "g3", category: "Wellness" },
  { id: "e", name: "Ah Beng", group_id: "g2", category: "Wellness" },
  { id: "f", name: "Faiz", group_id: null, category: "Wellness" },
];

describe("pairCandidates (D526, D530)", () => {
  it("lists every other team's eligible people, by team, names sorted", () => {
    expect(pairCandidates(groups, people, "g1", ["Wellness"])).toEqual([
      { id: "g2", name: "Team 2", people: [{ id: "e", name: "Ah Beng" }, { id: "b", name: "Ben" }] },
      { id: "g3", name: "Team 3", people: [{ id: "d", name: "Dina" }] },
    ]);
  });

  it("leaves out the submitter's own team, people in no team, and empty teams", () => {
    const teams = pairCandidates(groups, people, "g2", ["Wellness"]);
    expect(teams.map((t) => t.id)).toEqual(["g1", "g3"]);
    expect(teams.flatMap((t) => t.people.map((p) => p.id))).not.toContain("f");
  });

  it("lists everyone in other teams when the activity is open to every category", () => {
    expect(pairCandidates(groups, people, "g1", null).find((t) => t.id === "g2")?.people.map((p) => p.id)).toEqual(["e", "b", "c"]);
  });

  it("offers nobody to someone who is not in a team", () => {
    expect(pairCandidates(groups, people, null, null)).toEqual([]);
  });
});

describe("pairRefusal (D529)", () => {
  it("names the partner for every partner-side refusal", () => {
    expect(pairRefusal("pairsame", "partner", "Wei Jie")).toBe("Wei Jie is on your team. Tag someone from another team.");
    expect(pairRefusal("pairnoteam", "partner", "Wei Jie")).toBe("Wei Jie isn't in a team yet.");
    expect(pairRefusal("nogroup", "partner", "Wei Jie")).toBe("Wei Jie isn't in a team yet.");
    expect(pairRefusal("ineligible", "partner", "Wei Jie")).toBe("Wei Jie can't take part in this activity.");
    expect(pairRefusal("today", "partner", "Wei Jie")).toBe("Wei Jie already has an entry today.");
    expect(pairRefusal("limit", "partner", "Wei Jie")).toBe("Wei Jie has reached the limit for this activity.");
    expect(pairRefusal("groupdone", "partner", "Wei Jie")).toBe("Wei Jie has reached the limit for this activity.");
    expect(pairRefusal("duplicate", "partner", "Wei Jie")).toBe("Wei Jie already sent this photo in another entry.");
  });

  it("says the submitter needs a team, and covers the rare cases", () => {
    expect(pairRefusal("pairnoteam_self", "self", "Wei Jie")).toBe("You need to be in a team to tag someone.");
    expect(pairRefusal("pairself", "partner", "Wei Jie")).toBe("Pick someone other than the person this entry is for.");
    expect(pairRefusal("pairoff", "partner", "Wei Jie")).toBe("Tagging someone isn't on for this activity.");
    expect(pairRefusal("missing", "partner", "Wei Jie")).toBe("Couldn't add Wei Jie. Try again.");
  });

  it("leaves the member's own refusals, and ok, to the usual messages", () => {
    expect(pairRefusal("today", "self", "Wei Jie")).toBeNull();
    expect(pairRefusal("ok", "self", "Wei Jie")).toBeNull();
  });
});

describe("withText (D531)", () => {
  it("names the partner", () => expect(withText("Wei Jie")).toBe("With Wei Jie"));
  it("says nothing when the partner's entry is gone", () => {
    expect(withText(null)).toBeNull();
    expect(withText(undefined)).toBeNull();
  });
});

describe("pairRefusal on a track pair (D725, D730)", () => {
  it("says why the partner can't be tagged", () => {
    expect(pairRefusal("notrack", "partner", "Wei")).toBe("Wei isn't on a track yet, so they can't be tagged.");
    expect(pairRefusal("othertrack", "partner", "Wei")).toBe("Wei is on the other track. Tag someone on your track.");
    expect(pairRefusal("trackfull", "partner", "Wei")).toBe("Wei's team already has its places on this track taken today.");
  });
});
