import { describe, expect, it } from "vitest";
import { isTrackCaptain, otherActivityId, splitTracks, trackLabel, trackOf, trackStatus } from "@/features/tracks/lib";
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
