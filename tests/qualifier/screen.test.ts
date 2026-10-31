import { describe, expect, it } from "vitest";
import { boardLayout, closingNote, livePhase, placeLine, points, untilText } from "@/features/qualifier/screen";
import type { BoardEntry } from "@/features/qualifier/board";

const at = (iso: string) => Date.parse(iso);
const OPENS = "2026-11-02T01:00:00.000Z";
const CLOSES = "2026-11-09T01:00:00.000Z";

describe("livePhase", () => {
  it("opens and closes by the clock without a reload", () => {
    expect(livePhase("before", OPENS, CLOSES, at(OPENS) - 1)).toBe("before");
    expect(livePhase("before", OPENS, CLOSES, at(OPENS))).toBe("open");
    expect(livePhase("before", OPENS, CLOSES, at(CLOSES))).toBe("review");
    expect(livePhase("open", OPENS, CLOSES, at(CLOSES) - 1)).toBe("open");
    expect(livePhase("open", OPENS, CLOSES, at(CLOSES))).toBe("review");
  });
  it("leaves the other phases as the server said", () => {
    expect(livePhase("review", OPENS, CLOSES, at(OPENS))).toBe("review");
    expect(livePhase("confirmed", OPENS, CLOSES, at(OPENS))).toBe("confirmed");
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

describe("placeLine", () => {
  it("says a top-10 player is in while the qualifier is open", () => {
    expect(placeLine({ best: 900, rank: 3, cutScore: 500, phase: "open" })).toBe("You're in the top 10!");
    expect(placeLine({ best: 500, rank: 10, cutScore: 500, phase: "open" })).toBe("You're in the top 10!");
  });
  it("gives the place and the points to beat #10 (cutScore - best + 1)", () => {
    expect(placeLine({ best: 1000, rank: 14, cutScore: 1229, phase: "open" })).toBe("#14 · 230 points to the top 10");
    // Tied with #10 but behind on the earlier run: one point more is enough.
    expect(placeLine({ best: 500, rank: 11, cutScore: 500, phase: "open" })).toBe("#11 · 1 point to the top 10");
  });
  it("prints big gaps with thousands separators, and never asks for less than 1", () => {
    expect(placeLine({ best: 0, rank: 30, cutScore: 12_339, phase: "open" })).toBe("#30 · 12,340 points to the top 10");
    // A board copy a few seconds older than the player's own best.
    expect(placeLine({ best: 900, rank: 12, cutScore: 800, phase: "open" })).toBe("#12 · 1 point to the top 10");
  });
  it("asks for a run with no best yet", () => {
    expect(placeLine({ best: null, rank: null, cutScore: 500, phase: "open" })).toBe("Play to get on the board");
    expect(placeLine({ best: null, rank: null, cutScore: null, phase: "open" })).toBe("Play to get on the board");
  });
  it("makes no top-10 claim once the window is shut", () => {
    for (const phase of ["review", "confirmed"] as const) {
      expect(placeLine({ best: 900, rank: 3, cutScore: 500, phase })).toBe("#3");
      expect(placeLine({ best: 400, rank: 14, cutScore: 500, phase })).toBe("#14");
      expect(placeLine({ best: null, rank: null, cutScore: 500, phase })).not.toMatch(/top 10|Play/);
    }
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

const row = (rank: number, me = false): BoardEntry => ({ rank, label: `P${rank}`, score: 1000 - rank, me });

describe("boardLayout", () => {
  it("puts the cut under #10, then 11-20", () => {
    const items = boardLayout(Array.from({ length: 12 }, (_, i) => row(i + 1)), []);
    expect(items.map((i) => (i.kind === "row" ? i.entry.rank : i.kind))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "cut", 11, 12]);
  });
  it("puts the cut under the last row with fewer than 10", () => {
    const items = boardLayout([row(1), row(2)], []);
    expect(items.map((i) => (i.kind === "row" ? i.entry.rank : i.kind))).toEqual([1, 2, "cut"]);
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

describe("boardLayout with a confirmed cut", () => {
  it("puts the cut under the snapshot's last rank", () => {
    const items = boardLayout([row(1), row(2), row(3), row(4), row(5)], [], 3);
    expect(items.map((i) => (i.kind === "row" ? i.entry.rank : i.kind))).toEqual([1, 2, 3, "cut", 4, 5]);
  });
});
