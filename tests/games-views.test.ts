import { describe, expect, it } from "vitest";
import { publicStage } from "@/lib/games/views";
import { hydrateGame, type Game } from "@/lib/games/config";
import { idleStage, type StageRow } from "@/lib/games/phase";

const quiz = hydrateGame({
  id: "g1", org_id: "o1", event_id: "e1", title: "Quiz", position: 0, created_at: "", kind: "survival",
  config: { answer_s: 10, questions: [{ text: "Capital of Malaysia?", options: ["KL", "Penang"], correct: 0 }] },
}) as Game;
const race = hydrateGame({ id: "g2", org_id: "o1", event_id: "e1", title: "Race", position: 1, created_at: "", kind: "tap_race", config: { duration_s: 20 } }) as Game;
const at = (phase: StageRow["phase"], phase_data: Record<string, unknown>, game_id = "g1"): StageRow =>
  ({ ...idleStage("e1"), version: 3, run_id: "r1", game_id, phase, phase_data });

describe("publicStage — the correct answer is secret until revealed (D276)", () => {
  it("hides it while the question is open", () => {
    expect(publicStage(at("survival_question", { question: 0, deadline: "2026-10-01T10:00:10Z" }), quiz).question?.correct).toBeNull();
  });
  it("hides it once time is up but before the reveal", () => {
    expect(publicStage(at("survival_locked", { question: 0 }), quiz).question?.correct).toBeNull();
  });
  it("shows it on reveal", () => {
    expect(publicStage(at("survival_reveal", { question: 0, eliminated: 1, remaining: 2, everyone_survived: false }), quiz).question?.correct).toBe(0);
  });
  it("never puts the answer anywhere else in the payload", () => {
    expect(JSON.stringify(publicStage(at("survival_question", { question: 0 }), quiz))).not.toContain("\"correct\":0");
  });
});

describe("publicStage", () => {
  it("carries the question text, options and count", () => {
    expect(publicStage(at("survival_question", { question: 0 }), quiz).question)
      .toMatchObject({ no: 0, total: 1, text: "Capital of Malaysia?", options: ["KL", "Penang"], answer_s: 10 });
  });
  it("has no question in the lobby", () => {
    expect(publicStage(at("survival_lobby", {}), quiz).question).toBeNull();
  });
  it("carries a race's window as numbers", () => {
    const s = publicStage(at("race_live", { live_from: "2026-10-01T10:00:00.000Z", live_until: "2026-10-01T10:00:20.000Z" }, "g2"), race);
    expect(s.race).toEqual({ liveFrom: Date.parse("2026-10-01T10:00:00Z"), liveUntil: Date.parse("2026-10-01T10:00:20Z"), duration_s: 20 });
  });
  it("ignores a game that is not the one on stage", () => {
    expect(publicStage(at("race_lobby", {}, "g2"), quiz).game).toBeNull();
  });
  it("keys by version and phase", () => {
    expect(publicStage(at("survival_lobby", {}), quiz).key).toBe("3:survival_lobby");
  });
});
