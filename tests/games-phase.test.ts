import { describe, expect, it } from "vitest";
import {
  idleStage, hydrateStage, resolveStage, stageKey, phaseKind, canDo, allowedActions,
  lobbyWrite, raceStartWrite, raceStopWrite, questionWrite, overWrite, drawReadyWrite, idleWrite,
  raceWindow, currentQuestion, questionDeadline, revealFacts, spinFacts, COUNTDOWN_MS,
  type StageRow,
} from "@/lib/games/phase";

const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const stage = (over: Partial<StageRow>): StageRow => ({ ...idleStage("e1"), game_id: "g1", run_id: "r1", version: 4, ...over });

describe("hydrateStage", () => {
  it("is idle at version 0 when there is no row", () => {
    expect(hydrateStage("e1", null)).toEqual(idleStage("e1"));
  });
  it("reads an unknown phase as idle but keeps the version", () => {
    expect(hydrateStage("e1", { phase: "poll", version: 7 })).toEqual(idleStage("e1", 7));
  });
});

describe("resolveStage", () => {
  const countdown = stage({
    phase: "race_countdown",
    phase_ends_at: iso(T0 + 3000),
    phase_data: { live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) },
  });

  it("leaves a countdown alone before it ends", () => {
    expect(resolveStage(countdown, T0 + 1000).phase).toBe("race_countdown");
  });
  it("turns an ended countdown into the live race, ending at live_until", () => {
    const s = resolveStage(countdown, T0 + 3000);
    expect(s.phase).toBe("race_live");
    expect(s.phase_ends_at).toBe(iso(T0 + 23000));
  });
  it("chains a long-past countdown straight to results", () => {
    const s = resolveStage(countdown, T0 + 60_000);
    expect(s.phase).toBe("race_results");
    expect(s.phase_ends_at).toBeNull();
  });
  it("locks a question when its time is up", () => {
    const q = stage({ phase: "survival_question", phase_ends_at: iso(T0), phase_data: { question: 0, deadline: iso(T0) } });
    expect(resolveStage(q, T0).phase).toBe("survival_locked");
  });
  it("reveals a draw when the spin ends", () => {
    const d = stage({ phase: "draw_spinning", phase_ends_at: iso(T0), phase_data: { prize_no: 0, winner_ids: ["a1"] } });
    expect(resolveStage(d, T0 + 1).phase).toBe("draw_reveal");
  });
  it("reads a stage whose game was deleted as idle", () => {
    expect(resolveStage(stage({ phase: "race_lobby", game_id: null }), T0)).toEqual(idleStage("e1", 4));
  });
  it("does not change the version", () => {
    expect(resolveStage(countdown, T0 + 60_000).version).toBe(4);
  });
});

describe("stageKey", () => {
  it("changes when the clock moves a phase on, though the version did not", () => {
    const q = stage({ phase: "survival_question", phase_ends_at: iso(T0), phase_data: { question: 0 } });
    expect(stageKey(q)).not.toBe(stageKey(resolveStage(q, T0)));
  });
});

describe("phaseKind", () => {
  it("maps phases to their game kind", () => {
    expect([phaseKind("race_live"), phaseKind("survival_over"), phaseKind("draw_ready"), phaseKind("idle")])
      .toEqual(["tap_race", "survival", "draw", null]);
  });
});

describe("canDo", () => {
  it("only opens a game from idle", () => {
    expect(allowedActions("idle")).toEqual(["open"]);
  });
  it("cannot reveal while a question is still open", () => {
    expect(canDo("survival_question", "reveal")).toBe(false);
    expect(canDo("survival_locked", "reveal")).toBe(true);
  });
  it("allows nothing while a draw spins", () => {
    expect(allowedActions("draw_spinning")).toEqual([]);
  });
  it("lets the host switch games from a finished race without going idle first", () => {
    expect(canDo("race_results", "open")).toBe(true);
  });
});

describe("writes", () => {
  it("opens the right lobby for each kind", () => {
    expect(lobbyWrite({ id: "g1", kind: "tap_race" }, "r1").phase).toBe("race_lobby");
    expect(lobbyWrite({ id: "g1", kind: "survival" }, "r1").phase).toBe("survival_lobby");
    expect(lobbyWrite({ id: "g1", kind: "draw" }, "r1").phase).toBe("draw_ready");
  });
  it("starts a race 3 s from now and runs it for its duration", () => {
    const w = raceStartWrite(stage({ phase: "race_lobby" }), T0, 20);
    expect(w.phase).toBe("race_countdown");
    expect(w.phase_ends_at).toBe(iso(T0 + COUNTDOWN_MS));
    expect(w.phase_data).toEqual({ live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) });
  });
  it("stops a live race now", () => {
    const live = stage({ phase: "race_live", phase_data: { live_from: iso(T0), live_until: iso(T0 + 20000) } });
    expect(raceStopWrite(live, T0 + 5000).phase_data).toEqual({ live_from: iso(T0), live_until: iso(T0 + 5000) });
  });
  it("stopping during the countdown leaves an empty window", () => {
    const cd = stage({ phase: "race_countdown", phase_data: { live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) } });
    const w = raceStopWrite(cd, T0 + 1000);
    expect(w.phase).toBe("race_results");
    expect(w.phase_data).toEqual({ live_from: iso(T0 + 3000), live_until: iso(T0 + 3000) });
  });
  it("gives a question its answer time", () => {
    const w = questionWrite(stage({ phase: "survival_lobby" }), 0, T0, 10);
    expect(w.phase).toBe("survival_question");
    expect(w.phase_ends_at).toBe(iso(T0 + 10000));
    expect(w.phase_data).toEqual({ question: 0, deadline: iso(T0 + 10000) });
  });
  it("keeps the run and game through every in-game write", () => {
    const s = stage({ phase: "survival_reveal" });
    for (const w of [overWrite(s, 3), drawReadyWrite(s)]) expect([w.run_id, w.game_id]).toEqual(["r1", "g1"]);
  });
  it("goes idle with nothing attached", () => {
    expect(idleWrite()).toEqual({ run_id: null, game_id: null, phase: "idle", phase_data: {}, phase_ends_at: null });
  });
});

describe("readers", () => {
  it("reads the race window", () => {
    const s = stage({ phase: "race_live", phase_data: { live_from: iso(T0), live_until: iso(T0 + 20000) } });
    expect(raceWindow(s)).toEqual({ from: T0, until: T0 + 20000 });
  });
  it("reads the question and its deadline", () => {
    const s = stage({ phase: "survival_question", phase_data: { question: 2, deadline: iso(T0) } });
    expect([currentQuestion(s), questionDeadline(s)]).toEqual([2, T0]);
  });
  it("reads the reveal facts", () => {
    const s = stage({ phase: "survival_reveal", phase_data: { question: 0, eliminated: 5, remaining: 3, everyone_survived: false } });
    expect(revealFacts(s)).toEqual({ eliminated: 5, remaining: 3, everyoneSurvived: false });
  });
  it("reads the spin", () => {
    const s = stage({ phase: "draw_spinning", phase_data: { prize_no: 1, winner_ids: ["a1", "a2"] } });
    expect(spinFacts(s)).toEqual({ prizeNo: 1, winnerIds: ["a1", "a2"] });
  });
  it("returns null for data that is not there", () => {
    const s = stage({ phase: "race_lobby" });
    expect([raceWindow(s), currentQuestion(s), revealFacts(s), spinFacts(s)]).toEqual([null, null, null, null]);
  });
});
