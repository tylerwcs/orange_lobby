import { describe, expect, it } from "vitest";
import {
  TIER_LABELS, SKINS, byStanding, nearMiss, nextSkinHint, shareText, streakDays, streakDots, tierOf, unlockedSkins, type Entry,
} from "@/features/qualifier/progress";

const e = (wpm: number, accuracy: number, at: string): Entry => ({ wpm, accuracy, at });

describe("tierOf (D768)", () => {
  it("bands", () => {
    expect([null, 39.9, 40, 59.9, 60, 80].map(tierOf)).toEqual(["cadet", "cadet", "pilot", "pilot", "commander", "ace"]);
    expect(TIER_LABELS.ace).toBe("Ace");
  });
});

describe("streakDays", () => {
  it("counts back from today, or from yesterday when today has no run yet", () => {
    expect(streakDays(["2026-11-02", "2026-11-03", "2026-11-04"], "2026-11-04")).toBe(3);
    expect(streakDays(["2026-11-02", "2026-11-03"], "2026-11-04")).toBe(2);
    expect(streakDays(["2026-11-01", "2026-11-03"], "2026-11-03")).toBe(1);
    expect(streakDays([], "2026-11-03")).toBe(0);
  });
  it("a gap of more than a day since the last run is no streak", () => {
    expect(streakDays(["2026-11-01"], "2026-11-03")).toBe(0);
  });
  it("ignores duplicates, order and days after today", () => {
    expect(streakDays(["2026-11-04", "2026-11-03", "2026-11-03", "2026-11-09"], "2026-11-04")).toBe(2);
  });
  it("crosses month and year boundaries", () => {
    expect(streakDays(["2026-12-31", "2027-01-01"], "2027-01-01")).toBe(2);
  });
});

describe("unlockedSkins milestones", () => {
  it("unlocks by first run, 10 runs, 3-day streak, then each rank", () => {
    expect(unlockedSkins({ runs: 0, streak: 0, best: null })).toEqual([]);
    expect(unlockedSkins({ runs: 1, streak: 1, best: 30 })).toEqual(["violet"]);
    expect(unlockedSkins({ runs: 10, streak: 3, best: 82 })).toEqual([...SKINS]);
    expect(unlockedSkins({ runs: 3, streak: 1, best: 45 })).toEqual(["violet", "sky"]);
    expect(unlockedSkins({ runs: 2, streak: 1, best: 65 })).toEqual(["violet", "sky", "amber"]);
  });
});

describe("nearMiss lines", () => {
  it("short of the best", () => {
    expect(nearMiss({ wpm: 76, prevBest: 77.4, rank: 14, cutWpm: 79.5 })).toBe("Only 1.4 short of your best");
  });
  it("new best in the top 10", () => {
    expect(nearMiss({ wpm: 80, prevBest: 77.4, rank: 9, cutWpm: 79.5 })).toBe("New best! You're in the top 10!");
  });
  it("new best, the gap to the cut", () => {
    expect(nearMiss({ wpm: 78, prevBest: 77.4, rank: 12, cutWpm: 79.5 })).toBe("New best! 1.5 wpm to the top 10");
  });
  it("first flight", () => {
    expect(nearMiss({ wpm: 50, prevBest: null, rank: 40, cutWpm: null })).toBe("First flight: 50 wpm");
  });
  it("new best with fewer than 10 players: top 10 by rank", () => {
    expect(nearMiss({ wpm: 60, prevBest: 50, rank: 4, cutWpm: null })).toBe("New best! You're in the top 10!");
    expect(nearMiss({ wpm: 60, prevBest: 50, rank: null, cutWpm: null })).toBe("New best!");
  });
  it("a new best at rank 10 is top 10; below the cut with no gap left is plain", () => {
    expect(nearMiss({ wpm: 60, prevBest: 50, rank: 10, cutWpm: 59 })).toBe("New best! You're in the top 10!");
    expect(nearMiss({ wpm: 60, prevBest: 50, rank: 11, cutWpm: 60 })).toBe("New best!");
  });
  it("matched best and the 1-decimal rounding", () => {
    expect(nearMiss({ wpm: 77.4, prevBest: 77.4, rank: 14, cutWpm: 79.5 })).toBe("Matched your best");
    expect(nearMiss({ wpm: 70.1, prevBest: 70.2, rank: 3, cutWpm: 90 })).toBe("Only 0.1 short of your best");
  });
});

describe("byStanding: wpm, then accuracy, then earlier", () => {
  it("orders", () => {
    expect([e(70, 95, "b"), e(70, 98, "c"), e(70, 98, "a"), e(71, 80, "z")].sort(byStanding).map((x) => x.at)).toEqual(["z", "a", "c", "b"]);
  });
});

describe("shareText (D774)", () => {
  it("says the wpm, the rank and the event link", () => {
    expect(shareText(76, 14, "https://x/e/demo")).toBe("I flew 76 wpm in the Typing Qualifier — #14 so far. https://x/e/demo");
  });
  it("leaves out the rank when there is none", () => {
    expect(shareText(76, null, "https://x/e/demo")).toBe("I flew 76 wpm in the Typing Qualifier. https://x/e/demo");
  });
  it("keeps one decimal when the wpm has one", () => {
    expect(shareText(76.4, 3, "https://x")).toBe("I flew 76.4 wpm in the Typing Qualifier — #3 so far. https://x");
  });
  it("never carries a personal link", () => {
    expect(shareText(76, 14, "https://x/e/demo")).not.toMatch(/\/a\/[A-Za-z0-9]{12}/);
  });
});

describe("nextSkinHint (D774)", () => {
  it("is the first locked skin's milestone, in unlock order", () => {
    expect(nextSkinHint({ runs: 0, streak: 0, best: null })).toBe("Next skin: finish your first flight");
    expect(nextSkinHint({ runs: 4, streak: 1, best: 30 })).toBe("Next skin at 10 runs (6 to go)");
    expect(nextSkinHint({ runs: 10, streak: 1, best: 30 })).toBe("Next skin: fly 3 days in a row");
    expect(nextSkinHint({ runs: 10, streak: 3, best: 30 })).toBe("Next skin at 40 wpm");
    expect(nextSkinHint({ runs: 10, streak: 3, best: 45 })).toBe("Next skin at 60 wpm");
    expect(nextSkinHint({ runs: 10, streak: 3, best: 65 })).toBe("Next skin at 80 wpm");
  });
  it("is null once every skin is unlocked", () => {
    expect(nextSkinHint({ runs: 10, streak: 3, best: 90 })).toBeNull();
  });
});

describe("streakDots (D774)", () => {
  const opens = "2026-11-02T09:00:00+08:00";
  const closes = "2026-11-04T18:00:00+08:00";
  it("a short window has one dot per day, opens to closes", () => {
    expect(streakDots(opens, closes, "2026-11-03", ["2026-11-02"])).toEqual([
      { day: "2026-11-02", done: true }, { day: "2026-11-03", done: false }, { day: "2026-11-04", done: false },
    ]);
  });
  it("uses Malaysian days: 00:30 on the 3rd KL is still the 2nd in UTC", () => {
    expect(streakDots("2026-11-03T00:30:00+08:00", "2026-11-03T20:00:00+08:00", "2026-11-03", ["2026-11-03"]))
      .toEqual([{ day: "2026-11-03", done: true }]);
  });
  it("a long window shows the last 7 days ending today", () => {
    const d = streakDots("2026-11-01T09:00:00+08:00", "2026-11-30T18:00:00+08:00", "2026-11-12", ["2026-11-12", "2026-11-10", "2026-11-01"]);
    expect(d.map((x) => x.day)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(d.filter((x) => x.done).map((x) => x.day)).toEqual(["2026-11-10", "2026-11-12"]);
  });
  it("a long window ends at the close once it has passed, and never starts before the open", () => {
    const d = streakDots("2026-11-01T09:00:00+08:00", "2026-11-10T18:00:00+08:00", "2026-12-25", []);
    expect(d.map((x) => x.day)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]);
    const early = streakDots("2026-11-01T09:00:00+08:00", "2026-11-30T18:00:00+08:00", "2026-11-03", []);
    expect(early.map((x) => x.day)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("with no window set, the last 7 days ending today", () => {
    expect(streakDots(null, null, "2026-11-12", []).map((x) => x.day)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
  });
});
