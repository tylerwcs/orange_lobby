import { describe, expect, it } from "vitest";
import {
  defaultConfig, parseConfig, hydrateGame, gameMediaUrls, gameSummary, isGameKind,
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
  it("starts a draw with no checkpoint, no exclusions, no prizes and no card back", () => {
    expect(defaultConfig("draw")).toEqual({
      checkpoint_id: null, exclude_categories: [], prizes: [],
      format: "slot", spin_s: 6, rounds: 4, card_back: null, background: THEME,
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
      checkpoint_id: null, exclude_categories: [], prizes: [{ name: "iPad", quantity: 1, image: null }],
      format: "slot", spin_s: 6, rounds: 4, card_back: null, background: THEME,
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

describe("prize picture and card back (games polish, D323)", () => {
  it("an old stored draw with no image and no card_back parses with nulls", () => {
    const c = parseConfig("draw", { checkpoint_id: null, exclude_categories: [], prizes: [{ name: "iPad", quantity: 1 }] });
    expect(c?.card_back).toBeNull();
    expect(c?.prizes).toEqual([{ name: "iPad", quantity: 1, image: null }]);
  });
  it("keeps a prize's picture and the card back when they parse", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/event-media/o1/e1/game-prize-a1b2c3d4.png";
    const c = parseConfig("draw", {
      prizes: [{ name: "iPad", quantity: 1, image: url }],
      card_back: "https://abc.supabase.co/storage/v1/object/public/event-media/o1/e1/game-card-back-a1b2c3d4.png",
    });
    expect(c?.prizes[0].image).toBe(url);
    expect(c?.card_back).toBe("https://abc.supabase.co/storage/v1/object/public/event-media/o1/e1/game-card-back-a1b2c3d4.png");
  });
  it("reads an unreadable image or card_back as null rather than failing the whole game", () => {
    expect(parseConfig("draw", { prizes: [{ name: "iPad", quantity: 1, image: 42 }] })?.prizes[0].image).toBeNull();
    expect(parseConfig("draw", { card_back: 42 })?.card_back).toBeNull();
  });
  it("rejects an image or card_back over 2000 characters as null, tolerantly", () => {
    const long = "https://x.test/" + "a".repeat(2000);
    expect(parseConfig("draw", { prizes: [{ name: "iPad", quantity: 1, image: long }] })?.prizes[0].image).toBeNull();
    expect(parseConfig("draw", { card_back: long })?.card_back).toBeNull();
  });
});

describe("gameMediaUrls (games polish fix round 2, D323)", () => {
  const bgImage = (url: string) => ({ background: { kind: "image", url } });

  it("has nothing for a race or last one standing with a Theme background", () => {
    expect(gameMediaUrls(hydrateGame(row("tap_race", {}))!)).toEqual([]);
    expect(gameMediaUrls(hydrateGame(row("survival", {}))!)).toEqual([]);
  });
  it("includes a race's or last one standing's background image", () => {
    expect(gameMediaUrls(hydrateGame(row("tap_race", bgImage("https://cdn.test/bg1.png")))!)).toEqual(["https://cdn.test/bg1.png"]);
    expect(gameMediaUrls(hydrateGame(row("survival", bgImage("https://cdn.test/bg2.png")))!)).toEqual(["https://cdn.test/bg2.png"]);
  });
  it("includes a draw's background, every prize picture and the card back, skipping unset ones", () => {
    const g = hydrateGame(row("draw", {
      ...bgImage("https://cdn.test/bg.png"),
      prizes: [{ name: "iPad", quantity: 1, image: "https://cdn.test/ipad.png" }, { name: "Mug", quantity: 1, image: null }],
      card_back: "https://cdn.test/back.png",
    }))!;
    expect(gameMediaUrls(g)).toEqual(["https://cdn.test/bg.png", "https://cdn.test/ipad.png", "https://cdn.test/back.png"]);
  });
  it("has nothing for a draw with a Theme background, no prize pictures and no card back", () => {
    const g = hydrateGame(row("draw", { prizes: [{ name: "iPad", quantity: 1 }] }))!;
    expect(gameMediaUrls(g)).toEqual([]);
  });
});
