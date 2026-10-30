import { describe, expect, it } from "vitest";
import {
  boardLayout, claimFree, cutBar, droppedText, failMessage, gapLine, livePhase, skinColour, untilText,
} from "@/features/qualifier/screen";
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

describe("droppedText", () => {
  it("says how far below the cut a player knocked out of the top 10 is", () => {
    expect(droppedText({ from: 8, to: 11 }, { best: 59.4, cutWpm: 60, open: true })).toBe("You were knocked to #11 — 0.6 wpm to get back in");
  });
  it("asks for at least 0.1 when tied with #10", () => {
    expect(droppedText({ from: 10, to: 11 }, { best: 60, cutWpm: 60, open: true })).toBe("You were knocked to #11 — 0.1 wpm to get back in");
  });
  it("leaves out the way back once the window is shut, or without a cut", () => {
    expect(droppedText({ from: 8, to: 11 }, { best: 59.4, cutWpm: 60, open: false })).toBe("You were knocked to #11");
    expect(droppedText({ from: 8, to: 11 }, { best: 59.4, cutWpm: null, open: true })).toBe("You were knocked to #11");
  });
  it("says down to #N for any other fall", () => {
    expect(droppedText({ from: 15, to: 18 }, { best: 40, cutWpm: 60, open: true })).toBe("You were knocked down to #18");
    expect(droppedText({ from: 3, to: 7 }, { best: 70, cutWpm: 60, open: true })).toBe("You were knocked down to #7");
  });
  it("handles falling off the board", () => {
    expect(droppedText({ from: 4, to: null }, { best: null, cutWpm: 60, open: true })).toBe("You've dropped off the board");
  });
  it("is null with nothing to say", () => {
    expect(droppedText(null, { best: 50, cutWpm: 60, open: true })).toBeNull();
  });
});

describe("gapLine", () => {
  it("says a top-10 player is in", () => {
    expect(gapLine({ best: 70, rank: 3, cutWpm: 60 })).toBe("You're in the top 10");
  });
  it("says any finished run makes the top 10 while fewer than 10 have flown", () => {
    expect(gapLine({ best: null, rank: null, cutWpm: null })).toBe("Fewer than 10 pilots so far — a finished run puts you in the top 10");
  });
  it("gives #10's speed to someone with no run yet", () => {
    expect(gapLine({ best: null, rank: null, cutWpm: 61.2 })).toBe("#10 is flying at 61.2 wpm");
  });
  it("gives the gap to #10, at least 0.1", () => {
    expect(gapLine({ best: 58.8, rank: 14, cutWpm: 61.2 })).toBe("2.4 wpm to the top 10");
    expect(gapLine({ best: 61.2, rank: 11, cutWpm: 61.2 })).toBe("0.1 wpm to the top 10");
  });
});

describe("claimFree", () => {
  it("keeps the line while the qualifier is open", () => {
    expect(claimFree("New best! You're in the top 10!", "open")).toBe("New best! You're in the top 10!");
  });
  it("drops top-10 talk once it is closed", () => {
    expect(claimFree("New best! You're in the top 10!", "review")).toBe("New best!");
    expect(claimFree("New best! 2.1 wpm to the top 10", "review")).toBe("New best!");
    expect(claimFree("Only 1.4 short of your best", "review")).toBe("Only 1.4 short of your best");
  });
});

describe("cutBar", () => {
  it("puts the best and the #10 line on one scale with headroom", () => {
    expect(cutBar(50, 60)).toEqual({ bestPct: 75.8, cutPct: 90.9 });
    expect(cutBar(66, 60)).toEqual({ bestPct: 90.9, cutPct: 82.6 });
  });
  it("has no line without a cut, and no bar without either", () => {
    expect(cutBar(50, null)).toEqual({ bestPct: 90.9, cutPct: null });
    expect(cutBar(null, 60)).toEqual({ bestPct: 0, cutPct: 90.9 });
    expect(cutBar(null, null)).toBeNull();
  });
});

describe("failMessage", () => {
  it("has the brief's lines", () => {
    expect(failMessage("late")).toBe("That run didn't reach us in time — it doesn't count");
    expect(failMessage("done")).toBe("You started another run elsewhere");
    expect(failMessage("refused")).toBe("That run couldn't be counted");
    expect(failMessage("early")).toBe("That run couldn't be counted");
  });
});

const row = (rank: number, me = false): BoardEntry => ({ rank, label: `P${rank}`, skin: null, wpm: 100 - rank, me });

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

describe("skinColour", () => {
  it("has a colour for every skin and violet with none", () => {
    expect(skinColour(null)).toBe(skinColour("violet"));
    expect(skinColour("gold")).not.toBe(skinColour("violet"));
  });
});
