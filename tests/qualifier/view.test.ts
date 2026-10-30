import { describe, expect, it } from "vitest";
import { boardSlices, type BoardEntry } from "@/features/qualifier/board";

const rows = (n: number): BoardEntry[] =>
  Array.from({ length: n }, (_, i) => ({ rank: i + 1, label: `P${i + 1}`, skin: null, wpm: 100 - i, me: false }));
const ranks = (xs: BoardEntry[]) => xs.map((x) => x.rank);

describe("boardSlices (D771)", () => {
  it("top is ranks 1-20, around is the player and the rows beside them", () => {
    const s = boardSlices(rows(25), 23);
    expect(ranks(s.top)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(ranks(s.around)).toEqual([22, 23, 24]);
  });

  it("around leaves out rows already in the top 20", () => {
    expect(ranks(boardSlices(rows(25), 21).around)).toEqual([21, 22]);
    expect(ranks(boardSlices(rows(25), 22).around)).toEqual([21, 22, 23]);
  });

  it("around is empty inside the top 20, or with no rank", () => {
    expect(boardSlices(rows(25), 20).around).toEqual([]);
    expect(boardSlices(rows(25), 1).around).toEqual([]);
    expect(boardSlices(rows(25), null).around).toEqual([]);
  });

  it("the last place has no row below", () => {
    expect(ranks(boardSlices(rows(25), 25).around)).toEqual([24, 25]);
  });

  it("copes with a short board and unsorted input", () => {
    expect(boardSlices(rows(5), 3)).toEqual({ top: rows(5), around: [] });
    expect(ranks(boardSlices([...rows(25)].reverse(), 23).top)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
