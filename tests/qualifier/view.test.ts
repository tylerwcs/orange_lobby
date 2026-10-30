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

import { confirmedBoard, type RankedRow } from "@/features/qualifier/board";

const ranked = (rank: number, id = `p${rank}`): RankedRow => ({ rank, id, label: id.toUpperCase(), skin: null, wpm: 100 - rank });
const snapshot = (n: number) => Array.from({ length: n }, (_, i) => ranked(i + 1));
const confirmed = (o: Partial<Parameters<typeof confirmedBoard>[0]>) =>
  confirmedBoard({ finalists: snapshot(10), live: Array.from({ length: 20 }, (_, i) => ranked(i + 1)), myId: "me", myLiveRank: null, liveTotal: 40, ...o });
const shown = (r: ReturnType<typeof confirmedBoard>) => r.entries.map((e) => `${e.rank}:${e.label}`).sort((a, b) => parseInt(a) - parseInt(b));

describe("confirmedBoard (D769)", () => {
  it("is the live board when nothing changed since the confirm", () => {
    const r = confirmed({ myId: "p14", myLiveRank: 14 });
    expect(shown(r)).toEqual(Array.from({ length: 20 }, (_, i) => `${i + 1}:P${i + 1}`));
    expect(r).toMatchObject({ rank: 14, total: 40, cut: 10 });
  });

  it("keeps a finalist who left the live board; the live #11 stays below the cut", () => {
    // P3 cancelled after the confirm: the live board closes up beneath them.
    const live = Array.from({ length: 21 }, (_, i) => ranked(i + 1)).filter((r) => r.id !== "p3").map((r, i) => ({ ...r, rank: i + 1 }));
    const r = confirmed({ live: live.slice(0, 20), myId: "p11", myLiveRank: 10, liveTotal: 39 });
    expect(r.entries.find((e) => e.label === "P3")?.rank).toBe(3);
    expect(r.entries.filter((e) => e.rank <= r.cut).map((e) => e.label).sort()).toEqual(snapshot(10).map((f) => f.label).sort());
    expect(r.entries.find((e) => e.label === "P11")).toMatchObject({ rank: 11, me: true });
    expect(r).toMatchObject({ rank: 11, total: 40, cut: 10 });
  });

  it("gives a finalist their snapshot rank whatever the live board says", () => {
    expect(confirmed({ myId: "p3", myLiveRank: null }).rank).toBe(3);
    expect(confirmed({ myId: "p3", myLiveRank: 7 }).rank).toBe(3);
  });

  it("puts someone placed above the finalists after the confirm below the cut", () => {
    const live = [ranked(1, "late"), ...Array.from({ length: 19 }, (_, i) => ranked(i + 2, `p${i + 1}`))];
    const r = confirmed({ live, myId: "late", myLiveRank: 1, liveTotal: 41 });
    expect(r.entries.find((e) => e.label === "LATE")).toMatchObject({ rank: 11, me: true });
    expect(r.entries.find((e) => e.label === "P11")?.rank).toBe(12);
    expect(r).toMatchObject({ rank: 11, total: 41 });
  });

  it("numbers on from the snapshot's last rank past the top 20", () => {
    const top = Array.from({ length: 20 }, (_, i) => ranked(i + 1)).filter((r) => r.id !== "p2").map((r, i) => ({ ...r, rank: i + 1 }));
    const live = [...top, ranked(29, "x"), ranked(30, "me"), ranked(31, "y")];
    const r = confirmed({ live, myLiveRank: 30, liveTotal: 50 });
    // P2 is off the live board, so everyone past the cut is one further down than live.
    expect(r.rank).toBe(31);
    expect(r.total).toBe(51);
  });

  it("puts the cut under the snapshot's last rank when fewer than 10 were through", () => {
    const r = confirmed({ finalists: snapshot(4), live: [...snapshot(4), ranked(5, "late")], liveTotal: 5 });
    expect(r.cut).toBe(4);
    expect(r.entries.find((e) => e.label === "LATE")?.rank).toBe(5);
  });
});
