import { describe, expect, it } from "vitest";
import { dayTotals, intendedTrack, isTrackCaptain, memberTrackRefusal, otherActivityId, splitTracks, trackLabel, trackOf, trackStatus, trackTeamRows } from "@/features/tracks/lib";
import type { TrackPair, TrackRow } from "@/features/tracks/types";

const PAIR: TrackPair = { id: "p", event_id: "e", a_activity_id: "A", b_activity_id: "B", target: 5, bonus: 10 };
const row = (attendee_id: string, activity_id: string, group_id = "g1"): TrackRow => ({ pair_id: "p", attendee_id, group_id, activity_id });
const person = (id: string, group_id: string | null = "g1", cancelled_at: string | null = null) => ({ id, group_id, cancelled_at });

describe("trackOf (D722)", () => {
  it("is the activity of a row in the person's current group", () => {
    expect(trackOf([row("x", "A")], person("x"))).toBe("A");
  });
  it("ignores a row left behind by a team move", () => {
    expect(trackOf([row("x", "A", "g1")], person("x", "g2"))).toBeNull();
  });
  it("is null for a cancelled person and for someone with no row", () => {
    expect(trackOf([row("x", "A")], person("x", "g1", "2026-10-20T00:00:00Z"))).toBeNull();
    expect(trackOf([row("y", "A")], person("x"))).toBeNull();
  });
});

describe("trackStatus (D725)", () => {
  it("is null when the activity is in no pair", () => {
    expect(trackStatus(null, "A", "A")).toBeNull();
  });
  it("says this, other or none", () => {
    expect(trackStatus(PAIR, "A", "A")).toBe("this");
    expect(trackStatus(PAIR, "A", "B")).toBe("other");
    expect(trackStatus(PAIR, "A", null)).toBe("none");
  });
});

describe("trackLabel and otherActivityId (D721)", () => {
  it("names a as Track A and b as Track B", () => {
    expect(trackLabel(PAIR, "A")).toBe("Track A");
    expect(trackLabel(PAIR, "B")).toBe("Track B");
  });
  it("finds the other activity", () => {
    expect(otherActivityId(PAIR, "A")).toBe("B");
    expect(otherActivityId(PAIR, "B")).toBe("A");
  });
});

describe("splitTracks (D724)", () => {
  it("splits a team of 11 into 6, 4 and 1, keeping the members' order", () => {
    const members = Array.from({ length: 11 }, (_, i) => person(`m${i}`));
    const rows = [...members.slice(0, 6).map((m) => row(m.id, "A")), ...members.slice(6, 10).map((m) => row(m.id, "B"))];
    const split = splitTracks(PAIR, rows, members);
    expect([split.a.length, split.b.length, split.none.length]).toEqual([6, 4, 1]);
    expect(split.a.map((m) => m.id)).toEqual(["m0", "m1", "m2", "m3", "m4", "m5"]);
    expect(split.none[0].id).toBe("m10");
  });
  it("leaves a cancelled member out entirely", () => {
    const split = splitTracks(PAIR, [row("x", "A")], [person("x", "g1", "2026-10-20T00:00:00Z")]);
    expect([split.a.length, split.b.length, split.none.length]).toEqual([0, 0, 0]);
  });
});

describe("isTrackCaptain (D723)", () => {
  it("is a Yes in a field ticked on either activity", () => {
    const acts = [{ proxy_fields: [] }, { proxy_fields: ["captain"] }];
    expect(isTrackCaptain(acts, { extra: { captain: " Yes " } })).toBe(true);
    expect(isTrackCaptain(acts, { extra: { captain: "no" } })).toBe(false);
  });
});

describe("trackTeamRows (D724)", () => {
  const scoring = {
    a: { metric_key: "km", daily_min: 1, starts_on: "2026-10-26", ends_on: "2026-12-04", unit: "km", daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 3 }, { at: 8, pts: 4 }, { at: 10, pts: 5 }] },
    b: { metric_key: "minutes", daily_min: 20, starts_on: "2026-10-26", ends_on: "2026-12-04", unit: "min", daily_steps: [{ at: 20, pts: 1 }, { at: 30, pts: 2 }, { at: 45, pts: 3 }, { at: 60, pts: 4 }, { at: 120, pts: 5 }] },
  };
  const members = [
    { id: "aina", name: "Aina", group_id: "g1", cancelled_at: null },
    { id: "farah", name: "Farah", group_id: "g1", cancelled_at: null },
    { id: "wei", name: "Wei", group_id: "g1", cancelled_at: null },
    { id: "zul", name: "Zul", group_id: "g1", cancelled_at: null },
  ];
  const rows = [row("aina", "A"), row("farah", "B"), row("wei", "B")];
  // Wei has km on A that day from before a move - it is not his track's number.
  const totals = { a: new Map([["aina", 5.2], ["wei", 4]]), b: new Map([["farah", 45]]) };
  const run = (day = "2026-10-27") => trackTeamRows({ pair: PAIR, members, rows, totals, scoring, day, today: "2026-10-27", selfId: "farah" });

  it("reads each person on their own track, with that track's unit and points", () => {
    const g = run();
    expect(g.a).toEqual([{ id: "aina", name: "Aina", self: false, state: "logged", value: 5.2, unit: "km", pts: 3 }]);
    expect(g.b.find((r) => r.id === "farah")).toEqual({ id: "farah", name: "Farah", self: true, state: "logged", value: 45, unit: "min", pts: 3 });
  });
  it("puts the ones still to log first, and ignores the other track's number", () => {
    const g = run();
    expect(g.b.map((r) => [r.id, r.state, r.value])).toEqual([["wei", "missing", 0], ["farah", "logged", 45]]);
  });
  it("lists people with no track apart, and counts who logged across both tracks", () => {
    const g = run();
    expect(g.none.map((r) => [r.id, r.state])).toEqual([["zul", "none"]]);
    expect(g.logged).toBe(2);
  });
  it("shows a day still to come as future for everyone on a track", () => {
    const g = run("2026-10-28");
    expect([...g.a, ...g.b].every((r) => r.state === "future")).toBe(true);
    expect(g.logged).toBe(0);
  });
});

describe("intendedTrack (D724)", () => {
  it("acts on what the page showed, not on what the server finds now", () => {
    // The page showed Aina on B; tapping A means move her to A, even if someone already did.
    expect(intendedTrack(PAIR, "a", false)).toBe("A");
    // The page showed her on A; tapping A means take her off.
    expect(intendedTrack(PAIR, "a", true)).toBeNull();
    expect(intendedTrack(PAIR, "b", false)).toBe("B");
  });
});

describe("dayTotals (D724)", () => {
  it("sums one day per person, to two places, ignoring other days", () => {
    const rows = [
      { attendeeId: "x", groupId: "g1", day: "2026-10-27", km: 0.1 },
      { attendeeId: "x", groupId: "g2", day: "2026-10-27", km: 0.2 },
      { attendeeId: "x", groupId: "g1", day: "2026-10-26", km: 9 },
    ];
    expect(dayTotals(rows, "2026-10-27").get("x")).toBe(0.3);
  });
});

describe("memberTrackRefusal (D725)", () => {
  it("names the member when a captain sends for someone off this track", () => {
    expect(memberTrackRefusal("notrack", "Wei")).toBe("Wei isn't on a track yet. Put them on one from My team first.");
    expect(memberTrackRefusal("othertrack", "Wei")).toBe("Wei is on the other track. Submit for them there instead.");
    expect(memberTrackRefusal("closed", "Wei")).toBeNull();
  });
});
