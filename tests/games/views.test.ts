import { describe, expect, it } from "vitest";
import { GREEN_SAFE_D, celebrationDelay, emptyCelebration, optionStyles, publicStage, showKey } from "@/features/games/views";
import { hydrateGame, type Game } from "@/features/games/config";
import { GRACE_MS, idleStage, stageKey, type StageRow } from "@/features/games/phase";

const quiz = hydrateGame({
  id: "g1", org_id: "o1", event_id: "e1", title: "Quiz", position: 0, created_at: "", kind: "survival",
  config: { answer_s: 10, questions: [{ text: "Capital of Malaysia?", options: ["KL", "Penang"], correct: 0 }] },
}) as Game;
const race = hydrateGame({ id: "g2", org_id: "o1", event_id: "e1", title: "Race", position: 1, created_at: "", kind: "tap_race", config: { duration_s: 20 } }) as Game;
const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const at = (phase: StageRow["phase"], phase_data: Record<string, unknown>, game_id = "g1"): StageRow =>
  ({ ...idleStage("e1"), version: 3, run_id: "r1", game_id, phase, phase_data });

describe("publicStage — the correct answer is secret until revealed (D276)", () => {
  it("hides it while the question is open", () => {
    expect(publicStage(at("survival_question", { question: 0, deadline: "2026-10-01T10:00:10Z" }), quiz, T0).question?.correct).toBeNull();
  });
  it("hides it once time is up but before the reveal", () => {
    expect(publicStage(at("survival_locked", { question: 0 }), quiz, T0).question?.correct).toBeNull();
  });
  it("shows it on reveal", () => {
    expect(publicStage(at("survival_reveal", { question: 0, eliminated: 1, remaining: 2, everyone_survived: false }), quiz, T0).question?.correct).toBe(0);
  });
  it("never puts the answer anywhere else in the payload", () => {
    expect(JSON.stringify(publicStage(at("survival_question", { question: 0 }), quiz, T0))).not.toContain("\"correct\":0");
  });
});

describe("publicStage", () => {
  it("carries the question text, options and count", () => {
    expect(publicStage(at("survival_question", { question: 0 }), quiz, T0).question)
      .toMatchObject({ no: 0, total: 1, text: "Capital of Malaysia?", options: ["KL", "Penang"], answer_s: 10 });
  });
  it("has no question in the lobby", () => {
    expect(publicStage(at("survival_lobby", {}), quiz, T0).question).toBeNull();
  });
  it("carries a race's window as numbers", () => {
    const s = publicStage(at("race_live", { live_from: "2026-10-01T10:00:00.000Z", live_until: "2026-10-01T10:00:20.000Z" }, "g2"), race, T0);
    expect(s.race).toEqual({ liveFrom: Date.parse("2026-10-01T10:00:00Z"), liveUntil: Date.parse("2026-10-01T10:00:20Z"), duration_s: 20 });
  });
  it("ignores a game that is not the one on stage", () => {
    expect(publicStage(at("race_lobby", {}, "g2"), quiz, T0).game).toBeNull();
  });
  it("keys by version and phase", () => {
    expect(publicStage(at("survival_lobby", {}), quiz, T0).key).toBe("3:survival_lobby");
  });
  it("re-keys race results once late taps can no longer count", () => {
    const results = at("race_results", { live_from: "2026-10-01T09:59:40.000Z", live_until: "2026-10-01T10:00:00.000Z" }, "g2");
    expect(publicStage(results, race, T0 + 500).key).toBe("3:race_results");
    expect(publicStage(results, race, T0 + 5000).key).toBe("3:race_results:settled");
  });
  it("says whether the game on stage keys out green (D299)", () => {
    const g = { ...race, config: { ...race.config, background: { kind: "green" as const, url: null } } } as Game;
    expect(publicStage(at("race_lobby", {}, "g2"), g, T0).game?.green).toBe(true);
  });
});

describe("optionStyles (D299, D306)", () => {
  it("gives every option a colour, a letter and a shape", () => {
    expect(optionStyles(false).map((o) => o.shape)).toEqual(["▲", "◆", "●", "■"]);
  });
  it("swaps only the green option in green mode", () => {
    const normal = optionStyles(false);
    const green = optionStyles(true);
    expect(green[3].colour).toBe(GREEN_SAFE_D);
    expect(green.slice(0, 3)).toEqual(normal.slice(0, 3));
  });
});

describe("celebrationDelay (D305, D306, D317)", () => {
  it("throws confetti for every winner screen, after the podium rises or the card flips", () => {
    expect(celebrationDelay("race_results")).toBe(1600);
    expect(celebrationDelay("survival_over")).toBe(0);
    expect(celebrationDelay("draw_reveal")).toBe(0);
    expect(celebrationDelay("draw_card_reveal")).toBe(2000);
  });
  it("throws none anywhere else", () => {
    expect(celebrationDelay("draw_spinning")).toBeNull();
    expect(celebrationDelay("idle")).toBeNull();
  });
});

describe("showKey — the fanfare and confetti fire once per results screen", () => {
  const T0 = Date.parse("2026-09-30T10:00:00.000Z");
  const results: StageRow = {
    event_id: "e", run_id: "r", game_id: "g", phase: "race_results", version: 4, phase_ends_at: null,
    phase_data: { live_from: new Date(T0 - 20000).toISOString(), live_until: new Date(T0).toISOString() },
  };
  it("is the same before and after the race's totals settle", () => {
    const before = stageKey(results, T0);
    const after = stageKey(results, T0 + GRACE_MS + 5000);
    expect(after).not.toBe(before);
    expect(showKey(after)).toBe(showKey(before));
    expect(showKey(after)).toBe("4:race_results");
  });
  it("leaves every other key unchanged", () => {
    expect(showKey("4:race_lobby")).toBe("4:race_lobby");
    expect(showKey("7:draw_reveal")).toBe("7:draw_reveal");
    expect(showKey("")).toBe("");
  });
});

describe("emptyCelebration — no fanfare or confetti over an empty winner screen", () => {
  const at = (phase: StageRow["phase"]) => ({ phase });
  it("is empty for a draw reveal with no one left to draw", () => {
    expect(emptyCelebration({ stage: at("draw_reveal"), race: null, draw: { winners: [] } })).toBe(true);
    expect(emptyCelebration({ stage: at("draw_reveal"), race: null, draw: { winners: null } })).toBe(true);
    expect(emptyCelebration({ stage: at("draw_reveal"), race: null, draw: null })).toBe(true);
    expect(emptyCelebration({ stage: at("draw_reveal"), race: null, draw: { winners: [{ name: "A", company: "" }] } })).toBe(false);
  });
  it("is empty for race results with no lanes", () => {
    expect(emptyCelebration({ stage: at("race_results"), race: { lanes: [] }, draw: null })).toBe(true);
    expect(emptyCelebration({ stage: at("race_results"), race: null, draw: null })).toBe(true);
    expect(emptyCelebration({ stage: at("race_results"), race: { lanes: [{}] }, draw: null })).toBe(false);
  });
  it("never blocks the other winner screens", () => {
    expect(emptyCelebration({ stage: at("survival_over"), race: null, draw: null })).toBe(false);
    expect(emptyCelebration({ stage: at("draw_card_reveal"), race: null, draw: null })).toBe(false);
  });
});
