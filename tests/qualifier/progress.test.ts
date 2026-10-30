import { describe, expect, it } from "vitest";
import {
  TIER_LABELS, SKINS, byStanding, nearMiss, streakDays, tierOf, unlockedSkins, type Entry,
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
