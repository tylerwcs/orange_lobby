import { describe, expect, it } from "vitest";
import { goneEntryFiles, intendedTrack, placementsOn, trackFullFor, isTrackCaptain, showTrackSwitch, memberTrackRefusal, otherActivityId, splitTracks, trackLabel, trackOf, trackStatus, trackTeamRows } from "@/features/tracks/lib";
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
  // Wei has km on A that day, from before his move to B: his row shows it (D726).
  const totals = { a: new Map([["aina", 5.2], ["wei", 4]]), b: new Map([["farah", 45]]) };
  const run = (day = "2026-10-27") => trackTeamRows({ pair: PAIR, members, rows, totals, scoring, day, today: "2026-10-27", selfId: "farah" });

  it("reads each person on their own track, with that track's unit and points", () => {
    const g = run();
    expect(g.a).toEqual([{ id: "aina", name: "Aina", self: false, state: "logged", value: 5.2, unit: "km", pts: 3 }]);
    expect(g.b.find((r) => r.id === "farah")).toEqual({ id: "farah", name: "Farah", self: true, state: "logged", value: 45, unit: "min", pts: 3 });
  });
  it("shows a moved member's day on the track they logged it on, in name order once all have logged", () => {
    const g = run();
    expect(g.b.map((r) => [r.id, r.state, r.value, r.unit])).toEqual([["farah", "logged", 45, "min"], ["wei", "logged", 4, "km"]]);
  });
  it("lists people with no track apart, and counts who logged across both tracks", () => {
    const g = run();
    expect(g.none.map((r) => [r.id, r.state])).toEqual([["zul", "none"]]);
    expect(g.logged).toBe(3);
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

describe("memberTrackRefusal (D725)", () => {
  it("names the member when a captain sends for someone off this track", () => {
    expect(memberTrackRefusal("notrack", "Wei")).toBe("Wei isn't on a track yet. Put them on one from My team first.");
    expect(memberTrackRefusal("othertrack", "Wei")).toBe("Wei is on the other track. Submit for them there instead.");
    expect(memberTrackRefusal("trackfull", "Wei")).toBe("Wei's team already has its places on this track taken today.");
    expect(memberTrackRefusal("closed", "Wei")).toBeNull();
  });
});

describe("showTrackSwitch (D724)", () => {
  it("offers a captain the switch only for someone with no track, unless they are changing tracks", () => {
    expect(showTrackSwitch({ captain: true, placed: false, changing: false, isToday: true })).toBe(true);
    expect(showTrackSwitch({ captain: true, placed: true, changing: false, isToday: true })).toBe(false);
    expect(showTrackSwitch({ captain: true, placed: true, changing: true, isToday: true })).toBe(true);
  });
  it("never offers it to a member who isn't a captain", () => {
    expect(showTrackSwitch({ captain: false, placed: false, changing: true, isToday: true })).toBe(false);
  });
  it("offers it only on today's view; another day shows how the team stood (D734)", () => {
    expect(showTrackSwitch({ captain: true, placed: false, changing: true, isToday: false })).toBe(false);
  });
});

describe("trackTeamRows on a day logged on the other track (D726)", () => {
  const scoring = {
    a: { metric_key: "km", daily_min: 1, starts_on: "2026-10-26", ends_on: "2026-12-04", unit: "km", daily_steps: [{ at: 1, pts: 1 }, { at: 3, pts: 2 }, { at: 5, pts: 3 }] },
    b: { metric_key: "minutes", daily_min: 20, starts_on: "2026-10-26", ends_on: "2026-12-04", unit: "min", daily_steps: [{ at: 20, pts: 1 }, { at: 30, pts: 2 }, { at: 45, pts: 3 }] },
  };
  it("shows what the person logged on the other track that day, so an earlier day of a moved member doesn't read as Not logged", () => {
    // Wei is on B now, but logged 5 km on A on an earlier day, before his move.
    const g = trackTeamRows({ pair: PAIR, members: [{ id: "wei", name: "Wei", group_id: "g1", cancelled_at: null }], rows: [row("wei", "B")],
      totals: { a: new Map([["wei", 5]]), b: new Map() }, scoring, day: "2026-10-27", today: "2026-10-29", selfId: "x" });
    expect(g.b).toEqual([{ id: "wei", name: "Wei", self: false, state: "logged", value: 5, unit: "km", pts: 3 }]);
    expect(g.logged).toBe(1);
  });
});

describe("goneEntryFiles (D726)", () => {
  const folder = "org/ev/A/";
  const entry = (id: string, answers: Record<string, string>, pair_id: string | null = null) => ({ id, activity_id: "A", answers, pair_id });
  it("lists the photos of entries the move removed, and only those", () => {
    const before = [entry("e1", { km: "5", strava: `${folder}s1.jpg` }), entry("e2", { strava: `${folder}s2.jpg` })];
    expect(goneEntryFiles(before, new Set(["e2"]), { orgId: "org", eventId: "ev" })).toEqual([`${folder}s1.jpg`]);
  });
  it("keeps a pair entry's photos, which the partner's entry still shows", () => {
    expect(goneEntryFiles([entry("e1", { strava: `${folder}s1.jpg` }, "p1")], new Set(), { orgId: "org", eventId: "ev" })).toEqual([]);
  });
  it("ignores anything outside the activity's own folder", () => {
    expect(goneEntryFiles([entry("e1", { strava: "org/ev/OTHER/s1.jpg", note: "hello" })], new Set(), { orgId: "org", eventId: "ev" })).toEqual([]);
  });
});

describe("trackFullFor (D730)", () => {
  const logged = (ids: string[], activity_id = "A") => ids.map((attendee_id) => ({ attendee_id, activity_id }));
  it("is full for someone new once the team has the target number of people on the track today", () => {
    expect(trackFullFor(logged(["a", "b", "c", "d", "e"]), "A", "f", 5)).toBe(true);
    expect(trackFullFor(logged(["a", "b", "c", "d"]), "A", "f", 5)).toBe(false);
  });
  it("is never full for someone already counted today, who may add another session", () => {
    expect(trackFullFor(logged(["a", "b", "c", "d", "e"]), "A", "c", 5)).toBe(false);
  });
  it("counts people, not entries, and only on this track", () => {
    expect(trackFullFor([...logged(["a", "a", "a", "b"]), ...logged(["c", "d", "e"], "B")], "A", "f", 5)).toBe(false);
  });
});

describe("placementsOn (D734)", () => {
  const h = (attendee_id: string, activity_id: string | null, day: string, at = `${day}T01:00:00Z`) => ({ pair_id: "p", attendee_id, group_id: "g1", activity_id, day, at });
  const history = [h("x", "A", "2026-10-25"), h("x", "B", "2026-10-28"), h("y", "B", "2026-10-26"), h("y", null, "2026-10-27"), h("z", "A", "2026-10-27", "2026-10-27T01:00:00Z"), h("z", "B", "2026-10-27", "2026-10-27T05:00:00Z")];
  const on = (day: string, logged: { attendee_id: string; activity_id: string; group_id: string }[] = []) =>
    placementsOn(history, day, logged).map((r) => [r.attendee_id, r.activity_id]).sort();

  it("is each person's latest track on or before the day", () => {
    expect(on("2026-10-26")).toEqual([["x", "A"], ["y", "B"]]);
    expect(on("2026-10-28")).toEqual([["x", "B"], ["z", "B"]]);
  });
  it("leaves out someone taken off a track, and takes a day's last change", () => {
    expect(on("2026-10-27")).toEqual([["x", "A"], ["z", "B"]]);
  });
  it("places someone with no known track that day on the track they logged on", () => {
    expect(on("2026-10-24", [{ attendee_id: "w", activity_id: "B", group_id: "g1" }])).toEqual([["w", "B"]]);
    expect(on("2026-10-26", [{ attendee_id: "x", activity_id: "B", group_id: "g1" }])).toEqual([["x", "A"], ["y", "B"]]);
  });
});
