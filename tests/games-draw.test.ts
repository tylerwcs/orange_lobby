import { describe, expect, it } from "vitest";
import { eligiblePool, standingWinners, prizeProgress, nextPrize, drawCount, poolBeforeDraw, type WinnerRow } from "@/lib/games/draw";

const a = (id: string, category: string | null = "Staff") => ({ id, category });
const win = (attendee_id: string, prize_no = 0, isVoid = false): WinnerRow =>
  ({ id: `w-${attendee_id}`, event_id: "e1", game_id: "g1", prize_no, attendee_id, drawn_at: "2026-10-01T10:00:00Z", void: isVoid });

describe("eligiblePool", () => {
  const people = [a("1"), a("2", " crew "), a("3", null), a("4")];
  it("takes only people checked in at the checkpoint (D278)", () => {
    expect(eligiblePool(people, new Set(["1", "3"]), [], new Set()).map((p) => p.id)).toEqual(["1", "3"]);
  });
  it("excludes categories, trimmed and case-insensitive", () => {
    expect(eligiblePool(people, new Set(["1", "2"]), ["Crew"], new Set()).map((p) => p.id)).toEqual(["1"]);
  });
  it("keeps people with no category", () => {
    expect(eligiblePool(people, new Set(["3"]), ["Crew"], new Set()).map((p) => p.id)).toEqual(["3"]);
  });
  it("excludes past winners", () => {
    expect(eligiblePool(people, new Set(["1", "4"]), [], new Set(["4"])).map((p) => p.id)).toEqual(["1"]);
  });

  describe("multi-programme categories (mirrors draw_spin's category_matches)", () => {
    const multi = [a("k", "KOM, Crew"), a("w", "KOM, Wellness"), a("n", null), a("s", "Staff")];
    const all = new Set(["k", "w", "n", "s"]);
    it("leaves out someone when any one of their parts is excluded", () => {
      expect(eligiblePool(multi, all, ["Crew"], new Set()).map((p) => p.id)).toEqual(["w", "n", "s"]);
    });
    it("matches the excluded list trimmed and case-insensitive", () => {
      expect(eligiblePool(multi, all, [" crew "], new Set()).map((p) => p.id)).toEqual(["w", "n", "s"]);
    });
    it("keeps someone none of whose parts is excluded", () => {
      expect(eligiblePool(multi, all, ["Crew"], new Set()).map((p) => p.id)).toContain("w");
    });
    it("keeps everyone, no category included, when nothing is excluded", () => {
      expect(eligiblePool(multi, all, [], new Set()).map((p) => p.id)).toEqual(["k", "w", "n", "s"]);
    });
  });
});

describe("standingWinners", () => {
  it("leaves out voided winners, who may win again", () => {
    expect([...standingWinners([win("1"), win("2", 0, true)])]).toEqual(["1"]);
  });
});

describe("prizeProgress", () => {
  const prizes = [{ name: "Voucher", quantity: 3 }, { name: "iPad", quantity: 1 }];
  it("counts what each prize has given, ignoring voids", () => {
    expect(prizeProgress(prizes, [win("1"), win("2"), win("3", 0, true)])).toEqual([
      { prize_no: 0, name: "Voucher", quantity: 3, given: 2, remaining: 1 },
      { prize_no: 1, name: "iPad", quantity: 1, given: 0, remaining: 1 },
    ]);
  });
  it("draws in list order (D279)", () => {
    expect(nextPrize(prizeProgress(prizes, [win("1"), win("2"), win("3")]))?.name).toBe("iPad");
  });
  it("has no next prize when all are given", () => {
    expect(nextPrize(prizeProgress(prizes, [win("1"), win("2"), win("3"), win("4", 1)]))).toBeNull();
  });
});

describe("drawCount", () => {
  const prize = { prize_no: 0, name: "Voucher", quantity: 10, given: 4, remaining: 6 };
  it("draws one", () => {
    expect(drawCount(prize, "one", 100)).toBe(1);
  });
  it("draws all remaining", () => {
    expect(drawCount(prize, "all", 100)).toBe(6);
  });
  it("never draws more than the pool holds", () => {
    expect([drawCount(prize, "all", 2), drawCount(prize, "one", 0)]).toEqual([2, 0]);
  });
});

describe("poolBeforeDraw", () => {
  const people = [a("c"), a("a"), a("d"), a("b")];
  it("gives the same pool whether or not the winners have dropped out of it yet (D280)", () => {
    const stale = poolBeforeDraw(people, [a("b")]);
    const fresh = poolBeforeDraw(people.filter((p) => p.id !== "b"), [a("b")]);
    expect(fresh).toEqual(stale);
    expect(fresh.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("is the pool in id order when nothing is being drawn", () => {
    expect(poolBeforeDraw(people, []).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
});
