import { describe, expect, it } from "vitest";
import {
  defaultConfig, parseConfig, hydrateGame, gameSummary, isGameKind,
  DRAW_FORMAT_LABELS, drawFormSchema, prizeUnits, MAX_CARDS,
} from "@/lib/games/config";

const row = (kind: string, config: unknown) => ({
  id: "g1", org_id: "o1", event_id: "e1", title: "Game", position: 0, created_at: "2026-10-01T00:00:00Z", kind, config,
});

const THEME = { kind: "theme", url: null };

describe("defaultConfig", () => {
  it("starts a race at 20 seconds", () => {
    expect(defaultConfig("tap_race")).toEqual({ duration_s: 20, background: THEME });
  });
  it("starts last one standing with no questions and 10 s answers", () => {
    expect(defaultConfig("survival")).toEqual({ answer_s: 10, questions: [], background: THEME });
  });
  it("starts a draw with no checkpoint, no exclusions and no prizes", () => {
    expect(defaultConfig("draw")).toEqual({
      checkpoint_id: null, exclude_categories: [], prizes: [],
      format: "slot", spin_s: 6, rounds: 4, background: THEME,
    });
  });
});

describe("parseConfig", () => {
  it("rejects a race shorter than 10 s", () => {
    expect(parseConfig("tap_race", { duration_s: 5 })).toBeNull();
  });
  it("rejects a question whose correct answer is not one of its options", () => {
    expect(parseConfig("survival", { questions: [{ text: "Q", options: ["A", "B"], correct: 2 }] })).toBeNull();
  });
  it("rejects a question with only one option", () => {
    expect(parseConfig("survival", { questions: [{ text: "Q", options: ["A"], correct: 0 }] })).toBeNull();
  });
  it("trims text and keeps a valid question", () => {
    expect(parseConfig("survival", { questions: [{ text: " Q ", options: [" A", "B "], correct: 1 }] }))
      .toEqual({ answer_s: 10, questions: [{ text: "Q", options: ["A", "B"], correct: 1 }], background: THEME });
  });
  it("drops keys it does not know, so an older app still reads a newer row", () => {
    expect(parseConfig("tap_race", { duration_s: 30, sound: true })).toEqual({ duration_s: 30, background: THEME });
  });
  it("reads a null config as the defaults", () => {
    expect(parseConfig("draw", null)).toEqual(defaultConfig("draw"));
  });
});

describe("hydrateGame", () => {
  it("drops an unknown kind", () => {
    expect(hydrateGame(row("quiz", {}))).toBeNull();
  });
  it("drops a config that no longer parses", () => {
    expect(hydrateGame(row("tap_race", { duration_s: "fast" }))).toBeNull();
  });
  it("reads a good row", () => {
    expect(hydrateGame(row("tap_race", { duration_s: 15 }))?.config).toEqual({ duration_s: 15, background: THEME });
  });
  it("reads a draw whose stored checkpoint is not an id as having none, rather than dropping it", () => {
    const g = hydrateGame(row("draw", { checkpoint_id: "cp1", prizes: [{ name: "iPad", quantity: 1 }] }));
    expect(g?.config).toEqual({
      checkpoint_id: null, exclude_categories: [], prizes: [{ name: "iPad", quantity: 1 }],
      format: "slot", spin_s: 6, rounds: 4, background: THEME,
    });
  });
  it("keeps a draw's checkpoint id", () => {
    const id = "0b7c3d9e-1f2a-4b5c-8d6e-7f8091a2b3c4";
    expect(hydrateGame(row("draw", { checkpoint_id: id }))?.config).toMatchObject({ checkpoint_id: id });
  });
});

describe("isGameKind", () => {
  it("knows the three kinds and nothing else", () => {
    expect(["tap_race", "survival", "draw", "poll"].map(isGameKind)).toEqual([true, true, true, false]);
  });
});

describe("gameSummary", () => {
  it("describes a race", () => {
    expect(gameSummary(hydrateGame(row("tap_race", {}))!)).toBe("20 s race");
  });
  it("describes last one standing in the singular", () => {
    const g = hydrateGame(row("survival", { questions: [{ text: "Q", options: ["A", "B"], correct: 0 }] }))!;
    expect(gameSummary(g)).toBe("1 question · 10 s each");
  });
  it("describes a draw by prizes and how many there are to give", () => {
    const g = hydrateGame(row("draw", { prizes: [{ name: "iPad", quantity: 1 }, { name: "Voucher", quantity: 10 }] }))!;
    expect(gameSummary(g)).toBe("Slot machine · 2 prizes · 11 to give");
  });
});

describe("draw formats (D310, D311, D315, D321)", () => {
  it("an old draw reads as a slot machine with the defaults", () => {
    const c = parseConfig("draw", { checkpoint_id: null, exclude_categories: [], prizes: [] });
    expect(c).toMatchObject({ format: "slot", spin_s: 6, rounds: 4, background: { kind: "theme", url: null } });
  });
  it("an unknown stored format reads as slot rather than dropping the game", () => {
    expect(parseConfig("draw", { format: "roulette" })?.format).toBe("slot");
  });
  it("every kind gets a Theme background by default", () => {
    expect(defaultConfig("tap_race").background).toEqual({ kind: "theme", url: null });
    expect(defaultConfig("survival").background).toEqual({ kind: "theme", url: null });
  });
  it("counts prize units", () => {
    expect(prizeUnits([{ quantity: 1 }, { quantity: 2 }, { quantity: 7 }])).toBe(10);
  });
  it("the editor refuses a card round over 20 cards, but a stored one still reads", () => {
    const prizes = [{ name: "Mug", quantity: MAX_CARDS + 1 }];
    const form = { checkpoint_id: null, exclude_categories: [], prizes, format: "cards", spin_s: 6, rounds: 4 };
    expect(drawFormSchema.safeParse(form).success).toBe(false);
    expect(drawFormSchema.safeParse({ ...form, format: "slot" }).success).toBe(true);
    expect(parseConfig("draw", form)?.format).toBe("cards");
  });
  it("labels every format", () => {
    expect(Object.keys(DRAW_FORMAT_LABELS).sort()).toEqual(["cards", "mosaic", "slot", "wheel"]);
  });
});
