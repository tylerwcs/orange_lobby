import { describe, expect, it } from "vitest";
import { hasKinds, ineligibility, phaseOf, phaseSubtitle, type QualifierSettings } from "@/features/qualifier/phase";

const iso = "2026-11-05T10:00:00+08:00";
const opens = Date.parse("2026-11-02T09:00:00+08:00");
const closes = Date.parse("2026-11-04T18:00:00+08:00");
const s: QualifierSettings = {
  opens_at: "2026-11-02T09:00:00+08:00",
  closes_at: "2026-11-04T18:00:00+08:00",
  excluded_categories: [],
  confirmed_at: null,
  practice_per_day: null,
  official_per_day: null,
  play_hours: null,
};

describe("hasKinds (D907)", () => {
  it("offers practice runs only when the event allows some a day (D913)", () => {
    expect(hasKinds(null)).toBe(false);
    expect(hasKinds(s)).toBe(false);
    expect(hasKinds({ ...s, practice_per_day: 3 })).toBe(true);
    const capped: QualifierSettings = { ...s, official_per_day: 3 };
    expect(hasKinds(capped)).toBe(false);
    expect(hasKinds({ ...s, practice_per_day: 0 })).toBe(false);
  });
});
const t = opens + 1000;
const a = { id: "a1", category: "KOM" as string | null, cancelled_at: null as string | null };

describe("phaseOf (D768)", () => {
  it("is unset without settings or a window end", () => {
    expect(phaseOf(null, t)).toBe("unset");
    expect(phaseOf({ ...s, opens_at: null }, t)).toBe("unset");
    expect(phaseOf({ ...s, closes_at: null }, t)).toBe("unset");
  });
  it("walks before, open, closed; closes_at is exclusive", () => {
    expect(phaseOf(s, opens - 1)).toBe("before");
    expect(phaseOf(s, opens)).toBe("open");
    expect(phaseOf(s, closes - 1)).toBe("open");
    expect(phaseOf(s, closes)).toBe("closed");
  });
  it("an old finalist snapshot only reads as closed (D797)", () => {
    expect(phaseOf({ ...s, confirmed_at: iso }, opens + 1)).toBe("closed");
  });
  it("an unparseable date is unset, not a crash", () => {
    expect(phaseOf({ ...s, opens_at: "nope" }, t)).toBe("unset");
  });
});

describe("ineligibility (D768)", () => {
  it("cancelled, preview, one excluded category part is enough", () => {
    expect(ineligibility({ ...a, cancelled_at: iso }, null, [])).toBe("cancelled");
    expect(ineligibility(a, a.id, [])).toBe("preview");
    expect(ineligibility({ ...a, category: "KOM, Crew" }, null, ["crew"])).toBe("excluded");
    expect(ineligibility({ ...a, category: null }, null, ["Crew"])).toBeNull();
  });
  it("trims and ignores case; an empty list excludes no one", () => {
    expect(ineligibility({ ...a, category: "kom / CREW" }, null, ["  Crew "])).toBe("excluded");
    expect(ineligibility(a, null, [])).toBeNull();
    expect(ineligibility(a, undefined, ["crew"])).toBeNull();
  });
});

describe("phaseSubtitle (D770)", () => {
  it("names each phase, with dates in Malaysia time", () => {
    expect(phaseSubtitle(null, t)).toBe("Not scheduled");
    expect(phaseSubtitle(s, opens - 1000)).toBe("Opens 2 Nov, 09:00");
    expect(phaseSubtitle(s, t)).toBe("Open until 4 Nov, 18:00");
    expect(phaseSubtitle(s, closes)).toBe("Closed");
    expect(phaseSubtitle({ ...s, confirmed_at: iso }, closes + 1000)).toBe("Closed");
  });
  it("reads the date in Malaysia time whatever offset the instant was stored in", () => {
    expect(phaseSubtitle({ ...s, opens_at: "2026-11-01T17:00:00Z" }, Date.parse("2026-11-01T16:00:00Z"))).toBe("Opens 2 Nov, 01:00");
  });
});
