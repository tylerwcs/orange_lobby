import { describe, expect, it } from "vitest";
import { cardsLeft, cardsView, dealDeck, secureRandom } from "@/lib/games/cards";
import type { PrizeProgress, WinnerRow } from "@/lib/games/draw";

const progress = (quantities: number[], given: number[] = []): PrizeProgress[] =>
  quantities.map((quantity, prize_no) => ({ prize_no, name: `P${prize_no}`, quantity, given: given[prize_no] ?? 0, remaining: quantity - (given[prize_no] ?? 0) }));

const win = (attendee_id: string, card_no: number | null, prize_no: number | null, run_id = "r1", isVoid = false): WinnerRow =>
  ({ id: `w-${attendee_id}`, event_id: "e", game_id: "g", prize_no, attendee_id, drawn_at: "2026-10-01T02:00:00Z", void: isVoid, run_id, card_no });

describe("dealDeck (D317)", () => {
  it("deals one card per remaining prize unit", () => {
    const deck = dealDeck(progress([1, 2, 7]), () => 0.5);
    expect(deck).toHaveLength(10);
    expect(deck.filter((p) => p === 0)).toHaveLength(1);
    expect(deck.filter((p) => p === 1)).toHaveLength(2);
    expect(deck.filter((p) => p === 2)).toHaveLength(7);
  });
  it("leaves out units already given", () => {
    expect(dealDeck(progress([2, 1], [1, 1]), () => 0.5)).toEqual([0]);
  });
  it("shuffles with the random source it is given", () => {
    const a = dealDeck(progress([1, 1, 1, 1]), () => 0);
    const b = dealDeck(progress([1, 1, 1, 1]), () => 0.99);
    expect(a).not.toEqual(b);
  });
  it("secureRandom stays in [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const x = secureRandom();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("cardsView (D317)", () => {
  const prizes = [{ name: "Mug", quantity: 2, image: null }, { name: "Pen", quantity: 1, image: "https://cdn.test/pen.png" }];
  const deck = [0, 1, 0];
  const nameOf = (id: string) => ({ a: "Ann Lee", b: "Ben Tan" })[id] ?? "";

  it("numbers cards from 1 and keeps every untaken prize secret, including its picture", () => {
    expect(cardsView(deck, [], "r1", prizes, nameOf)).toEqual([
      { no: 1, taken: false, prize: null, image: null, winner: null },
      { no: 2, taken: false, prize: null, image: null, winner: null },
      { no: 3, taken: false, prize: null, image: null, winner: null },
    ]);
  });
  it("shows a taken card's prize, picture and winner", () => {
    const v = cardsView(deck, [win("a", 2, 1)], "r1", prizes, nameOf);
    expect(v[1]).toEqual({ no: 2, taken: true, prize: "Pen", image: "https://cdn.test/pen.png", winner: "Ann Lee" });
    expect(v[0].prize).toBeNull();
    expect(v[0].image).toBeNull();
  });
  it("has no picture when the taken prize has none", () => {
    const v = cardsView(deck, [win("a", 1, 0)], "r1", prizes, nameOf);
    expect(v[0]).toEqual({ no: 1, taken: true, prize: "Mug", image: null, winner: "Ann Lee" });
  });
  it("ignores void winners, other runs and people still to pick", () => {
    const rows = [win("a", 1, 0, "r1", true), win("b", 3, 0, "r0"), win("c", null, null)];
    expect(cardsView(deck, rows, "r1", prizes, nameOf).every((c) => !c.taken)).toBe(true);
    expect(cardsLeft(deck, rows, "r1")).toBe(3);
  });
  it("counts the cards left", () => {
    expect(cardsLeft(deck, [win("a", 2, 1), win("b", 1, 0)], "r1")).toBe(1);
  });
});
