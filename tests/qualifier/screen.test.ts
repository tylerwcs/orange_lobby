import { describe, expect, it } from "vitest";
import { boardLayout, closesIn, closingNote, isNewBest, livePhase, placeLine, points, untilText } from "@/features/qualifier/screen";
import type { BoardEntry } from "@/features/qualifier/board";

const at = (iso: string) => Date.parse(iso);
const OPENS = "2026-11-02T01:00:00.000Z";
const CLOSES = "2026-11-09T01:00:00.000Z";

describe("livePhase", () => {
  it("opens and closes by the clock without a reload", () => {
    expect(livePhase("before", OPENS, CLOSES, at(OPENS) - 1)).toBe("before");
    expect(livePhase("before", OPENS, CLOSES, at(OPENS))).toBe("open");
    expect(livePhase("before", OPENS, CLOSES, at(CLOSES))).toBe("closed");
    expect(livePhase("open", OPENS, CLOSES, at(CLOSES) - 1)).toBe("open");
    expect(livePhase("open", OPENS, CLOSES, at(CLOSES))).toBe("closed");
  });
  it("leaves the other phases as the server said", () => {
    expect(livePhase("closed", OPENS, CLOSES, at(OPENS))).toBe("closed");
    expect(livePhase("unset", null, null, 0)).toBe("unset");
  });
});

describe("untilText", () => {
  it("reads days and hours, hours and minutes, then minutes and seconds", () => {
    expect(untilText(2 * 86_400_000 + 4 * 3_600_000 + 5000)).toBe("2d 4h");
    expect(untilText(3 * 3_600_000 + 5 * 60_000 + 30_000)).toBe("3h 05m");
    expect(untilText(4 * 60_000 + 59_000)).toBe("4:59");
    expect(untilText(9_400)).toBe("0:10");
  });
  it("never goes below zero", () => {
    expect(untilText(-5000)).toBe("0:00");
  });
});

describe("placeLine (D797: a plain leaderboard)", () => {
  it("gives the place on the board", () => {
    expect(placeLine({ best: 900, rank: 3, total: 40, phase: "open" })).toBe("You're #3 of 40");
    expect(placeLine({ best: 400, rank: 14, total: 40, phase: "closed" })).toBe("You're #14 of 40");
  });
  it("says the top spot as such", () => {
    expect(placeLine({ best: 900, rank: 1, total: 40, phase: "open" })).toBe("You're top of the board!");
    expect(placeLine({ best: 900, rank: 1, total: 1, phase: "open" })).toBe("You're on the board!");
  });
  it("makes no finale claim, anywhere", () => {
    for (const phase of ["open", "closed"] as const) {
      for (const rank of [1, 5, 10, 11, 30]) {
        expect(placeLine({ best: 100, rank, total: 30, phase })).not.toMatch(/top 10|finale|cut/i);
      }
    }
  });
  it("asks for a run with no best yet, while open", () => {
    expect(placeLine({ best: null, rank: null, total: 0, phase: "open" })).toBe("Play to get on the board");
    expect(placeLine({ best: null, rank: null, total: 5, phase: "closed" })).toBe("You're not on the board");
  });
});

describe("points", () => {
  it("groups thousands", () => {
    expect(points(0)).toBe("0");
    expect(points(1230)).toBe("1,230");
    expect(points(1_234_567)).toBe("1,234,567");
  });
});

describe("closingNote", () => {
  const closes = at(CLOSES);
  it("is null more than 20 minutes before the close", () => {
    expect(closingNote(closes, closes - 21 * 60_000)).toBeNull();
  });
  it("warns in the last 20 minutes that a run started now still counts", () => {
    expect(closingNote(closes, closes - 12 * 60_000)).toBe("Closes in 12 min — a run started now still counts.");
    expect(closingNote(closes, closes - 20 * 60_000)).toBe("Closes in 20 min — a run started now still counts.");
    expect(closingNote(closes, closes - 30_000)).toBe("Closes in 1 min — a run started now still counts.");
  });
  it("is null once it has closed", () => {
    expect(closingNote(closes, closes)).toBeNull();
    expect(closingNote(closes, closes + 60_000)).toBeNull();
  });
});

describe("closesIn", () => {
  const closes = at(CLOSES);
  it("counts down to the close with untilText, whenever the window is open", () => {
    expect(closesIn(closes, closes - 3 * 86_400_000 - 4 * 3_600_000)).toBe("Closes in 3d 4h");
    expect(closesIn(closes, closes - 12 * 60_000)).toBe("Closes in 12:00");
  });
});

describe("isNewBest", () => {
  it("is a first run that scored, or a score over the best before it", () => {
    expect(isNewBest(10, null)).toBe(true);
    expect(isNewBest(500, 400)).toBe(true);
  });
  it("is not a first run that scored 0, nor a score at or under the best", () => {
    expect(isNewBest(0, null)).toBe(false);
    expect(isNewBest(400, 400)).toBe(false);
    expect(isNewBest(300, 400)).toBe(false);
  });
});

const row = (rank: number, me = false): BoardEntry => ({ rank, label: `P${rank}`, score: 1000 - rank, me });

describe("boardLayout", () => {
  it("lists the top rows in order, with no cut line", () => {
    const items = boardLayout(Array.from({ length: 12 }, (_, i) => row(i + 1)), []);
    expect(items.map((i) => (i.kind === "row" ? i.entry.rank : i.kind))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("adds a gap row before the rows around the player further down", () => {
    const top = Array.from({ length: 20 }, (_, i) => row(i + 1));
    const items = boardLayout(top, [row(30), row(31, true), row(32)]);
    expect(items.slice(-5).map((i) => (i.kind === "row" ? i.entry.rank : i.kind))).toEqual([20, "gap", 30, 31, 32]);
  });
  it("adds no gap when the rows run on", () => {
    const top = Array.from({ length: 20 }, (_, i) => row(i + 1));
    const items = boardLayout(top, [row(21, true), row(22)]);
    expect(items.slice(-3).map((i) => (i.kind === "row" ? i.entry.rank : i.kind))).toEqual([20, 21, 22]);
  });
  it("is empty for an empty board", () => {
    expect(boardLayout([], [])).toEqual([]);
  });
});

import { leftNote, leftToday, opensAgain, ruleLines, usedAfterStart } from "@/features/qualifier/screen";

describe("practice and official runs (D909)", () => {
  const noon = at("2026-11-16T04:00:00.000Z"); // 12:00 pm in Malaysia
  const limits = { practice: 3, official: 1 };
  const used = { day: "2026-11-16", practice: 3, official: 0 };

  it("leftToday takes today's runs off the limit, never below zero", () => {
    expect(leftToday({ limits, used }, noon)).toEqual({ practice: 0, official: 1 });
    expect(leftToday({ limits, used: { ...used, practice: 5, official: 1 } }, noon)).toEqual({ practice: 0, official: 0 });
  });
  it("leftToday starts again once the Malaysia day has moved on", () => {
    expect(leftToday({ limits, used }, at("2026-11-16T16:00:00.000Z"))).toEqual({ practice: 3, official: 1 });
  });
  it("leftToday is null for a kind with no limit", () => {
    expect(leftToday({ limits: { practice: null, official: 1 }, used }, noon)).toEqual({ practice: null, official: 1 });
  });
  it("usedAfterStart counts the start, on a new day from nothing", () => {
    expect(usedAfterStart(used, "official", noon)).toEqual({ day: "2026-11-16", practice: 3, official: 1 });
    expect(usedAfterStart(used, "practice", at("2026-11-16T16:00:00.000Z"))).toEqual({ day: "2026-11-17", practice: 1, official: 0 });
  });
  it("leftNote says what is left", () => {
    expect(leftNote(2)).toBe("2 left today");
    expect(leftNote(0)).toBe("None left today");
    expect(leftNote(null)).toBeNull();
  });
  it("ruleLines lists only what the event set", () => {
    expect(ruleLines({ limits, playHours: [0, 600, 720, 840, 1140, 1440] })).toEqual([
      "Practice: up to 3 runs a day. They don't count.",
      "Official: 1 attempt a day. Only official attempts go on the leaderboard.",
      "Play before 10:00 am, 12:00 pm – 2:00 pm, after 7:00 pm only.",
      "An attempt is used as soon as you press Start.",
    ]);
    expect(ruleLines({ limits: { practice: null, official: null }, playHours: [720, 840] })).toEqual(["Play 12:00 pm – 2:00 pm only."]);
    expect(ruleLines({ limits: { practice: null, official: null }, playHours: null })).toEqual([]);
    expect(ruleLines({ limits: { practice: null, official: 3 }, playHours: null })).toEqual([
      "3 attempts a day. Your best one goes on the leaderboard.",
      "An attempt is used as soon as you press Start.",
    ]);
    expect(ruleLines({ limits: { practice: 0, official: 1 }, playHours: [720, 840] })).toEqual([
      "1 attempt a day.",
      "Play 12:00 pm – 2:00 pm only.",
      "An attempt is used as soon as you press Start.",
    ]);
  });
  it("opensAgain names the time", () => {
    expect(opensAgain(noon, noon - 3_600_000)).toBe("Opens again at 12:00 pm");
    expect(opensAgain(noon, noon - 20 * 3_600_000)).toBe("Opens again at 12:00 pm tomorrow");
  });
});
