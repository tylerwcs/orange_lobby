import { describe, expect, it } from "vitest";
import { clockOffset, phoneInterval, displayInterval, backoff } from "@/lib/games/poll";

describe("clockOffset", () => {
  it("is the server time minus the request's midpoint", () => {
    expect(clockOffset(1000, 1200, 5100)).toBe(4000);
  });
});

describe("intervals (D256)", () => {
  it("polls a phone every second while a game is on, every 5 s otherwise", () => {
    expect([phoneInterval("race_live"), phoneInterval("survival_question"), phoneInterval("idle"), phoneInterval(null)])
      .toEqual([1000, 1000, 5000, 5000]);
  });
  it("polls the LED every 250 ms during a race, every second otherwise", () => {
    expect([displayInterval("race_live"), displayInterval("race_countdown"), displayInterval("survival_reveal")])
      .toEqual([250, 250, 1000]);
  });
});

describe("backoff", () => {
  it("doubles from one second up to eight", () => {
    expect([1, 2, 3, 4, 5, 9].map(backoff)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
});
