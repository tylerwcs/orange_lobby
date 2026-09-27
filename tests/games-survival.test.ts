import { describe, expect, it } from "vitest";
import { stillIn, inGoingInto, outAt, revealOutcome, answerSplit, isOver, answerAccepted, type PlayerRow } from "@/lib/games/survival";

const rows: PlayerRow[] = [
  { attendee_id: "a", out_at_question: null },
  { attendee_id: "b", out_at_question: 0 },
  { attendee_id: "c", out_at_question: 1 },
  { attendee_id: "d", out_at_question: null },
];

describe("who is in", () => {
  it("is still in when never eliminated", () => {
    expect(stillIn(rows)).toEqual(["a", "d"]);
  });
  it("was in going into a question if eliminated at it or later", () => {
    expect(inGoingInto(rows, 1)).toEqual(["a", "c", "d"]);
  });
  it("knows who went out at a question", () => {
    expect(outAt(rows, 1)).toEqual(["c"]);
  });
});

describe("revealOutcome", () => {
  it("eliminates wrong answers and missing ones (D272)", () => {
    const r = revealOutcome(["a", "b", "c"], new Map([["a", 1], ["b", 0]]), 1);
    expect(r).toEqual({ eliminated: ["b", "c"], survivors: ["a"], everyoneSurvived: false });
  });
  it("eliminates nobody when everyone still in is wrong", () => {
    const r = revealOutcome(["a", "b"], new Map([["a", 0]]), 1);
    expect(r).toEqual({ eliminated: [], survivors: ["a", "b"], everyoneSurvived: true });
  });
  it("is not 'everyone survives' when nobody is playing", () => {
    expect(revealOutcome([], new Map(), 0).everyoneSurvived).toBe(false);
  });
});

describe("answerSplit", () => {
  it("counts each option and ignores out-of-range choices", () => {
    expect(answerSplit([0, 2, 2, 5, -1], 3)).toEqual([1, 0, 2]);
  });
});

describe("isOver", () => {
  it("ends when one player is left", () => {
    expect(isOver(1, 0, 10)).toBe(true);
  });
  it("ends after the last question", () => {
    expect(isOver(12, 9, 10)).toBe(true);
  });
  it("carries on otherwise", () => {
    expect(isOver(12, 3, 10)).toBe(false);
  });
});

describe("answerAccepted", () => {
  const deadline = Date.parse("2026-10-01T10:00:00Z");
  it("accepts up to 1.5 s after the deadline", () => {
    expect(answerAccepted(deadline, deadline + 1500)).toBe(true);
  });
  it("refuses anything later", () => {
    expect(answerAccepted(deadline, deadline + 1501)).toBe(false);
  });
});
