import { describe, expect, it } from "vitest";
import { TEST_STEPS, testStep } from "@/lib/games/display-test";

const event = { name: "Test event", logoUrl: null, colour: "#F97316" };

describe("display self-test (D296)", () => {
  it("plays a slot spin, a wheel spin, a card flip and a winner, then loops", () => {
    const phases = Array.from({ length: TEST_STEPS + 1 }, (_, i) => testStep(i, event, 0).state.stage.phase);
    expect(phases).toEqual(["draw_spinning", "draw_spinning", "draw_card_reveal", "draw_reveal", "draw_spinning"]);
    expect(testStep(1, event, 0).state.draw?.format).toBe("wheel");
  });
  it("times each spin from the moment its step starts", () => {
    const s = testStep(0, event, 10_000).state;
    expect(s.stage.endsAt).toBe(10_000 + (s.draw?.spinMs ?? 0));
  });
  it("gives every step its own key, so sounds and scenes replay", () => {
    expect(new Set([0, 1, 2, 3, 4].map((i) => testStep(i, event, 0).state.stage.key)).size).toBe(5);
  });
  it("lands the wheel on a name that is on it, and hides every untaken card", () => {
    const wheel = testStep(1, event, 0).state.draw!;
    expect(wheel.wheel?.some((p) => p.id === wheel.targets?.[0]?.id)).toBe(true);
    const cards = testStep(2, event, 0).state.draw!.cards!;
    expect(cards.slots.filter((c) => !c.taken).every((c) => c.prize === null)).toBe(true);
  });
});
