import { describe, it, expect } from "vitest";
import { reviewFlags, reviewEntries, untrackedEntries, latestOf, type ReviewEntry, type UsageRow } from "@/features/catalogue/review";
import { featureSet } from "@/features/catalogue/features";
import { FEATURES } from "@/features/catalogue/catalogue";

const e = (over: Partial<ReviewEntry>): ReviewEntry => ({ key: "k", name: "K", experimental: false, origin: { date: "2026-06" }, tracked: true, users: [], ...over });
const u = (startsOn: string | null): UsageRow => ({ eventId: startsOn ?? "x", eventName: "E", status: "live", startsOn, features: featureSet([], 0), options: new Set() });

describe("reviewFlags (D782)", () => {
  it("flags an experimental entry used by one event or none as one client only", () => {
    expect(reviewFlags([e({ experimental: true, users: [u("2026-10-20")] })], "2026-11-01")[0].oneClient).toBe(true);
    expect(reviewFlags([e({ experimental: true, users: [u("2026-10-20"), u("2026-10-25")] })], "2026-11-01")).toEqual([]);
  });
  it("flags an entry older than three months that no recent event uses as gone quiet", () => {
    expect(reviewFlags([e({ origin: { date: "2026-06" }, users: [u("2026-05-10"), u("2026-05-20")] })], "2026-11-01")[0].goneQuiet).toBe(true);
  });
  it("never flags an entry younger than three months for going quiet", () => {
    expect(reviewFlags([e({ origin: { date: "2026-09" }, users: [] })], "2026-11-01")).toEqual([]);
  });
  it("judges recency by event dates, ignoring events with no start date", () => {
    expect(reviewFlags([e({ origin: { date: "2026-06" }, users: [u(null), u(null)] })], "2026-11-01")[0].goneQuiet).toBe(true);
  });
  it("does not flag an old entry that a recent event uses", () => {
    expect(reviewFlags([e({ origin: { date: "2026-06" }, users: [u("2026-10-05")] })], "2026-11-01")).toEqual([]);
  });
  it("counts an upcoming event as recent use", () => {
    expect(reviewFlags([e({ origin: { date: "2026-06" }, users: [u("2026-12-05")] })], "2026-11-01")).toEqual([]);
  });
  it("treats an origin exactly three months back as not yet old", () => {
    expect(reviewFlags([e({ origin: { date: "2026-08" }, users: [] })], "2026-11-01")).toEqual([]);
  });
  it("clamps to the end of a short month when counting back", () => {
    // 31 May minus three months is 28 Feb 2026, not a spill into March.
    expect(reviewFlags([e({ origin: { date: "2026-02" }, users: [u("2026-02-28")] })], "2026-05-31")).toEqual([]);
    expect(reviewFlags([e({ origin: { date: "2026-02" }, users: [u("2026-02-27")] })], "2026-05-31")[0].goneQuiet).toBe(true);
  });
  it("never flags an entry whose usage is not tracked, however old or experimental", () => {
    const old = e({ key: "n", tracked: false, experimental: true, origin: { date: "2025-01" }, users: [] });
    expect(reviewFlags([old], "2026-11-01")).toEqual([]);
  });
  it("keeps only flagged entries, with both flags when both apply", () => {
    const flagged = reviewFlags([e({ key: "a", experimental: true, origin: { date: "2026-06" }, users: [] }), e({ key: "b" , origin: { date: "2026-10" } })], "2026-11-01");
    expect(flagged.map((f) => f.entry.key)).toEqual(["a"]);
    expect(flagged[0]).toMatchObject({ oneClient: true, goneQuiet: true });
  });
});

describe("reviewEntries (D782)", () => {
  const row = (id: string, addons: string[], options: string[] = []): UsageRow => ({ ...u("2026-10-01"), eventId: id, features: featureSet(addons, 0), options: new Set(options) });
  it("lists every add-on and option that has an origin, and nothing else", () => {
    const keys = reviewEntries([]).map((x) => x.key);
    expect(keys).toContain("language");
    expect(keys).toContain("typing_qualifier");
    expect(keys).toContain("approval");
    expect(keys).not.toContain("whatsapp"); // an add-on with no origin
    expect(keys).not.toContain("portal"); // core
  });
  it("lists an option with an origin but no inUse as not tracked, with no users", () => {
    const rows = [row("e1", [], ["theme"])];
    const theme = reviewEntries(rows).find((x) => x.key === "theme")!;
    expect(theme.tracked).toBe(false);
    expect(theme.users).toEqual([]);
    expect(reviewEntries(rows).find((x) => x.key === "approval")!.tracked).toBe(true);
    expect(reviewEntries(rows).find((x) => x.key === "language")!.tracked).toBe(true);
    expect(untrackedEntries(reviewEntries(rows)).map((x) => x.key)).toContain("theme");
    expect(untrackedEntries(reviewEntries(rows)).every((x) => !x.tracked)).toBe(true);
  });
  it("tracks every option with an origin that has an inUse check, including the polaroid print look", () => {
    const untracked = untrackedEntries(reviewEntries([])).map((x) => x.key);
    expect(untracked).not.toContain("polaroid_print_look");
    expect(untracked).not.toContain("waiting_list");
  });
  it("takes an add-on's users from the events that have it, and marks experimental ones", () => {
    const rows = [row("e1", ["language"]), row("e2", [])];
    const language = reviewEntries(rows).find((x) => x.key === "language")!;
    expect(language.users.map((r) => r.eventId)).toEqual(["e1"]);
    expect(language.experimental).toBe(FEATURES.language.tier === "experimental");
    expect(language.parent).toBeUndefined();
  });
  it("takes an option's users from the events using it, and names its feature", () => {
    const rows = [row("e1", [], ["approval"]), row("e2", [])];
    const approval = reviewEntries(rows).find((x) => x.key === "approval")!;
    expect(approval.users.map((r) => r.eventId)).toEqual(["e1"]);
    expect(approval.parent).toBe("registration");
  });
});

describe("latestOf", () => {
  it("picks the event with the latest start date, ignoring undated ones", () => {
    expect(latestOf([u(null), u("2026-03-01"), u("2026-09-01"), u("2026-05-01")])?.startsOn).toBe("2026-09-01");
  });
  it("falls back to the first when none is dated, and to nothing when empty", () => {
    const rows = [{ ...u(null), eventId: "first" }, { ...u(null), eventId: "second" }];
    expect(latestOf(rows)?.eventId).toBe("first");
    expect(latestOf([])).toBeUndefined();
  });
});
