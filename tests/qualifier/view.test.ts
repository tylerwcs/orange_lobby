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

import { aroundWindow, needsFreshSlice, type SeenRow } from "@/features/qualifier/board";

const seen = (n: number, from = 1): SeenRow[] =>
  Array.from({ length: n }, (_, i) => ({ rank: from + i, id: `p${from + i}`, wpm: 100 - (from + i) }));
const ask = (o: Partial<Parameters<typeof needsFreshSlice>[0]>) =>
  needsFreshSlice({ top: seen(20), around: [], myId: "p5", myRank: 5, myWpm: 95, total: 500, ...o });

describe("needsFreshSlice (D771)", () => {
  it("is fresh when the caller's row is where their rank says", () => {
    expect(ask({})).toEqual({ board: false, around: false });
    expect(ask({ myRank: null })).toEqual({ board: false, around: false });
  });

  it("is stale when the caller climbed into the top 20, or moved within it", () => {
    expect(ask({ myId: "me", myRank: 12, myWpm: 88 }).board).toBe(true);
    expect(ask({ myId: "p5", myRank: 3, myWpm: 95 }).board).toBe(true);
  });

  it("is stale when the caller's wpm moved but their rank did not", () => {
    expect(ask({ myWpm: 97 }).board).toBe(true);
  });

  it("is stale when the caller fell out of the top 20 but the snapshot still lists them", () => {
    expect(ask({ myRank: 24, myWpm: 95 })).toEqual({ board: true, around: true });
  });

  it("is stale when the rank is beyond the snapshot's total (a first run)", () => {
    expect(ask({ myId: "me", myRank: 501, myWpm: 30, total: 500 }).board).toBe(true);
  });

  it("past rank 20 checks the around rows for the caller at their rank", () => {
    const around = seen(3, 22);
    expect(ask({ myId: "p23", myRank: 23, myWpm: 77, around })).toEqual({ board: false, around: false });
    expect(ask({ myId: "p23", myRank: 24, myWpm: 77, around }).around).toBe(true);
    expect(ask({ myId: "p23", myRank: 23, myWpm: 80, around }).around).toBe(true);
  });
});

describe("aroundWindow", () => {
  it("is the rank and its neighbours as a zero-based offset", () => {
    expect(aroundWindow(30)).toEqual({ offset: 28, limit: 3 });
  });
  it("never reaches into the top 20", () => {
    expect(aroundWindow(21)).toEqual({ offset: 20, limit: 2 });
    expect(aroundWindow(22)).toEqual({ offset: 20, limit: 3 });
  });
});
